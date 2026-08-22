import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";

// Allow this route more time on Vercel — a 30-photo batch takes longer than the 10s default.
export const maxDuration = 60;

// Anthropic's API supports up to 100 images per request (32MB total). Above 20 images the
// per-image max dimension drops to 2000px, but we already resize to 1568px, so we're safely
// under that regardless. Capped well below the hard limit for safety margin.
const MAX_PHOTOS = 40;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  // Accept either a single photoUrl (back-compat) or photoUrls (array) — always normalise to an array
  const photoUrls: string[] = body.photoUrls || (body.photoUrl ? [body.photoUrl] : []);
  const { context, provider: requestedProvider, identifyRoom, existingNotes, inspectionId } = body;

  if (photoUrls.length === 0) {
    return NextResponse.json({ error: "Missing photo(s)" }, { status: 400 });
  }
  if (photoUrls.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Please analyse ${MAX_PHOTOS} or fewer photos at once` }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI analysis isn't configured yet — add OPENAI_API_KEY or ANTHROPIC_API_KEY to your environment." },
      { status: 503 }
    );
  }

  // Fetch and resize every image in parallel — doing this one at a time would be genuinely
  // slow for a 20-30+ photo batch and risks a timeout. Resizing also fixes photos that exceed
  // the vision API's max dimensions (a full-resolution phone photo can be 4000px+ on a side).
  async function fetchAndResize(url: string, maxDimension = 1568) {
    const imgRes = await fetch(url);
    if (!imgRes.ok) throw new Error("Could not download photo");
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    const resized = await sharp(buffer)
      .rotate() // respect EXIF orientation so phone photos aren't sideways
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    return { base64: resized.toString("base64"), mediaType: "image/jpeg" };
  }

  let images: { base64: string; mediaType: string }[];
  try {
    images = await Promise.all(photoUrls.map((url: string) => fetchAndResize(url)));
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Couldn't load one or more photos for analysis" }, { status: 502 });
  }

  // For room-identification mode, gather reference photos already known to be from specific
  // rooms elsewhere in the same inspection (most Mid-Term templates capture a photo per room
  // section as part of the walkthrough). Comparing the unlabeled Maintenance photos against
  // these — same wall colour, flooring, fixtures — is far more grounded than asking the AI
  // to guess a room type in the abstract with no reference point.
  let referenceImages: { label: string; base64: string; mediaType: string }[] = [];
  if (identifyRoom && inspectionId) {
    try {
      const session2 = await getSession();
      const companyId = (session2?.user as any)?.companyId as string | null;

      const inspection = await prisma.inspection.findFirst({
        where: { id: inspectionId, property: { companyId: companyId || undefined } },
        select: { id: true, excludedSectionIds: true },
      });

      if (inspection) {
        const excludedIds: string[] = inspection.excludedSectionIds ? JSON.parse(inspection.excludedSectionIds) : [];

        const answers = await prisma.fieldAnswer.findMany({
          where: {
            inspectionId,
            field: { type: "PHOTO", hidden: false, section: { hidden: false } },
          },
          include: { photos: true, field: { include: { section: true } } },
        });

        // One reference photo per distinct room-titled section — skipping Maintenance itself
        // (that's the unlabeled set we're trying to identify), sections hidden just for this
        // inspection, and any section with no photo actually uploaded yet.
        const seenSections = new Set<string>();
        const referenceCandidates: { label: string; url: string }[] = [];
        for (const answer of answers) {
          const section = answer.field.section;
          if (section.title.toLowerCase().includes("maintenance")) continue;
          if (excludedIds.includes(section.id)) continue;
          if (seenSections.has(section.title)) continue;
          if (answer.photos.length === 0) continue;
          seenSections.add(section.title);
          referenceCandidates.push({ label: section.title, url: answer.photos[0].url });
        }

        // Cap reference photos so a very long template doesn't blow out the request size
        const capped = referenceCandidates.slice(0, 20);
        referenceImages = await Promise.all(
          capped.map(async (ref) => ({ label: ref.label, ...(await fetchAndResize(ref.url, 700)) }))
        );
      }
    } catch (err) {
      // Reference photos are a nice-to-have, not required — fall back to guessing without
      // them rather than failing the whole analysis if this lookup has a problem.
      console.error("Couldn't load reference photos:", err);
    }
  }

  const provider =
    requestedProvider === "anthropic" || requestedProvider === "openai"
      ? requestedProvider
      : process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : "openai";

  const multiple = images.length > 1;

  const referenceInstruction =
    referenceImages.length > 0
      ? `\n\nThe first ${referenceImages.length} image(s) you're shown are REFERENCE photos, each already confirmed to be from a specific room (labelled below). The remaining images are the unlabeled photos you need to identify. For each unlabeled photo, compare it against the reference photos — same wall colour, flooring, fixtures, furniture, decor style — and if it visually matches a reference room, use that room's exact name. If a photo doesn't plausibly match ANY of the reference rooms (e.g. it's an area with no reference photo, like a garden, garage, or communal area), don't force a bad match — instead label it with your best general guess of the area type, or "Unidentified area" if genuinely unclear, and keep it as its own separate entry rather than merging it into a reference room it doesn't actually match. Reference labels: ${referenceImages
          .map((r) => r.label)
          .join(", ")}.`
      : "";

  const systemPrompt = identifyRoom
    ? // Maintenance-section mode: photos may be pooled from different rooms with no known
      // room per photo — the AI has to work out the room from what's visible, not assume.
      "You help a property inspector document maintenance issues from photos, to speed up their report writing — you are assisting, not replacing their judgement. " +
      "These photos may come from DIFFERENT rooms or areas in the property, pooled together in one batch — do not assume they're all the same room. " +
      "First, work out which room/area each photo is most likely from, based on visible cues (tiles and sanitaryware suggest a bathroom, kitchen units suggest a kitchen, a radiator plus wardrobe/bed suggests a bedroom, a radiator plus sofa/TV suggests a living room, etc) and any hint text provided. Always commit to a single best-guess room type per photo — never hedge, never say unclear. " +
      "IMPORTANT: you have no way of knowing how many rooms of each type the property actually has. Different photos of the SAME room (different corners, angles, or close-ups) will often look different from each other — don't mistake this for evidence of separate rooms. " +
      'Only split same-type rooms into numbered instances (e.g. "Bedroom 1", "Bedroom 2") if there is clear, specific evidence they are physically different rooms — e.g. different bed/furniture style, a different window position or wall colour that couldn\'t plausibly be the same room from another angle. If you\'re not sure whether photos are the same room or different rooms of the same type, default to treating them as the SAME room and combine them into one entry — inventing extra rooms that don\'t exist is worse than under-splitting. ' +
      "Then describe each photo, one entry per photo (do not try to merge or group entries yourself — that happens afterward in code, not by you). " +
      "Within each entry, describe only what's visibly present: the surface/material and the specific defect(s) if any. Never guess at a cause you can't actually see (e.g. don't claim a pipe burst if you only see a stain). " +
      'The label for each entry MUST be a room or area name (e.g. "Bathroom", "Bedroom", "Kitchen", "Living room", "Hallway") — never a surface or material name like "Wall" or "Ceiling" as a substitute for actually naming the room. If cues are weak, still commit to your best-guess room type rather than falling back to describing the surface instead. ' +
      'Format each entry as: "Room: description." — one line per photo, no "Photo N" numbering. If a photo shows nothing concerning, say so plainly rather than inventing an issue. ' +
      "Do not add a summary, conclusion, or any text after the last entry." +
      referenceInstruction
    : "You help a property inspector document a maintenance issue from photos, to speed up their report writing — you are assisting, not replacing their judgement. " +
      (multiple
        ? "You'll be shown multiple photos of the same item/area — treat them together as different angles or close-ups of one situation, and write ONE combined description, not one per photo. "
        : "") +
      "Describe only what's visibly present: the surface/material and the specific defect if any (cracking, staining, damage, wear, etc). " +
      "Never guess at a cause you can't actually see in the image(s) (e.g. don't claim a pipe burst if you only see a stain — say the stain pattern instead, and that the cause needs on-site investigation). " +
      "If nothing concerning is visible, say so plainly rather than inventing an issue. Keep to 2-4 factual sentences suitable for pasting into a formal report, which the inspector will review and edit before submitting.";

  const notesHint =
    identifyRoom && existingNotes && existingNotes.trim()
      ? `\n\nThe inspector has already noted: "${existingNotes.trim()}" — use this alongside the visual cues to help identify which room each photo is likely from, if relevant.`
      : "";

  const userPrompt =
    (context ? `Context: ${context}\n\n` : "") +
    (identifyRoom
      ? `Describe ${images.length > 1 ? `each of these ${images.length} photos` : "this photo"} for a maintenance report, identifying the likely room for each.`
      : multiple
      ? `Describe these ${images.length} photos together for a maintenance report.`
      : "Describe this photo for a maintenance report.") +
    notesHint;

  try {
    let result: string | undefined;

    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const content: any[] = [];
      for (const ref of referenceImages) {
        content.push({ type: "text", text: `Reference photo — ${ref.label}:` });
        content.push({ type: "image", source: { type: "base64", media_type: ref.mediaType, data: ref.base64 } });
      }
      if (referenceImages.length > 0) {
        content.push({ type: "text", text: "Now here are the unlabeled photos to identify:" });
      }
      for (const img of images) {
        content.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
      }
      content.push({ type: "text", text: userPrompt });

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 500,
          system: systemPrompt,
          messages: [{ role: "user", content }],
        }),
      });
      if (!response.ok) {
        console.error("Anthropic vision error:", await response.text());
        return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
      }
      const data = await response.json();
      result = data.content?.[0]?.text?.trim();
    } else if (process.env.OPENAI_API_KEY) {
      const content: any[] = [];
      for (const ref of referenceImages) {
        content.push({ type: "text", text: `Reference photo — ${ref.label}:` });
        content.push({ type: "image_url", image_url: { url: `data:${ref.mediaType};base64,${ref.base64}` } });
      }
      if (referenceImages.length > 0) {
        content.push({ type: "text", text: "Now here are the unlabeled photos to identify:" });
      }
      for (const img of images) {
        content.push({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.base64}` } });
      }
      content.push({ type: "text", text: userPrompt });

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content },
          ],
        }),
      });
      if (!response.ok) {
        console.error("OpenAI vision error:", await response.text());
        return NextResponse.json({ error: "AI analysis failed" }, { status: 502 });
      }
      const data = await response.json();
      result = data.choices?.[0]?.message?.content?.trim();
    }

    if (!result) return NextResponse.json({ error: "No response from AI" }, { status: 502 });

    // Merge same-room lines with actual code rather than hoping the AI groups them itself —
    // far more reliable once there are many photos, since "identify AND merge" is a lot to
    // ask a model to do perfectly across a dozen-plus images in one pass.
    if (identifyRoom) {
      const lines = result
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);

      const roomOrder: string[] = [];
      const roomDescriptions = new Map<string, string[]>();

      for (const line of lines) {
        const colonIndex = line.indexOf(":");
        if (colonIndex === -1) continue; // skip anything that doesn't match "Room: description"

        const room = line.slice(0, colonIndex).trim();
        const description = line.slice(colonIndex + 1).trim();
        if (!room || !description) continue;

        const key = room.toLowerCase();
        if (!roomDescriptions.has(key)) {
          roomOrder.push(room); // keep the AI's original casing for the first occurrence
          roomDescriptions.set(key, []);
        }
        roomDescriptions.get(key)!.push(description);
      }

      if (roomOrder.length > 0) {
        result = roomOrder.map((room) => `${room}: ${roomDescriptions.get(room.toLowerCase())!.join(" ")}`).join("\n\n");
      }
      // If parsing found nothing usable (unexpected format), fall back to the raw AI text
      // as-is rather than returning something empty.
    }

    return NextResponse.json({ description: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
