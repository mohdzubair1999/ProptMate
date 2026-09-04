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

// Finds the check-in record for the same room + item/field a check-out photo is being
// analysed for, so the AI can compare current condition against what was actually recorded
// when the tenant moved in, rather than describing current state with no reference point.
async function findCheckInContext(
  currentInspection: { propertyId: string; comparedToInspectionId: string | null; completedDate: Date | null },
  matchRoom: string,
  matchLabel: string,
  companyId: string | null
): Promise<string | null> {
  // Prefers whatever inspection staff have already explicitly linked via the existing
  // "Comparing against..." feature - but only if that link genuinely points to a check-in;
  // if it points to something else (e.g. a prior mid-term), falls through to searching for
  // the actual most recent check-in instead, since that's specifically what this needs.
  let checkInInspectionId: string | null = null;
  if (currentInspection.comparedToInspectionId) {
    const compared = await prisma.inspection.findFirst({
      where: { id: currentInspection.comparedToInspectionId, type: "check-in", property: { companyId: companyId || undefined } },
      select: { id: true },
    });
    if (compared) checkInInspectionId = compared.id;
  }

  if (!checkInInspectionId) {
    // Most recent check-in for the same property, completed before this check-out's own
    // completion date (or now, if this check-out isn't marked complete yet) - a plain "most
    // recent check-in overall" could otherwise wrongly match a later, unrelated tenancy's
    // check-in if inspections were ever completed out of chronological order.
    const cutoff = currentInspection.completedDate || new Date();
    const mostRecentCheckIn = await prisma.inspection.findFirst({
      where: {
        propertyId: currentInspection.propertyId,
        type: "check-in",
        status: "completed",
        completedDate: { lte: cutoff },
        deletedAt: null,
        property: { companyId: companyId || undefined },
      },
      orderBy: { completedDate: "desc" },
      select: { id: true },
    });
    checkInInspectionId = mostRecentCheckIn?.id || null;
  }

  if (!checkInInspectionId) return null;

  // Exact, trimmed, case-insensitive match on room + item name only - deliberately never
  // fuzzy. A wrong match (silently comparing against a different item) is worse than finding
  // no match at all and just describing current condition with no comparison, since a wrong
  // comparison could put false context in front of the inspector without them realising it.
  const matchedItem = await prisma.inspectionItem.findFirst({
    where: { inspectionId: checkInInspectionId, room: { equals: matchRoom, mode: "insensitive" }, itemName: { equals: matchLabel, mode: "insensitive" } },
    select: { condition: true, cleanliness: true, notes: true },
  });
  if (matchedItem) {
    const parts = [`condition recorded as "${matchedItem.condition || "not recorded"}"`];
    if (matchedItem.cleanliness) parts.push(`cleanliness "${matchedItem.cleanliness}"`);
    parts.push(`notes: ${matchedItem.notes?.trim() ? `"${matchedItem.notes.trim()}"` : "none recorded"}`);
    return parts.join(", ");
  }

  // Falls back to a matching field answer (e.g. a room's "Comments" field) if no inventory
  // item matched - covers the other place AI analysis runs, on a Comments field rather than
  // a specific inventory item.
  const matchedAnswer = await prisma.fieldAnswer.findFirst({
    where: {
      inspectionId: checkInInspectionId,
      field: { label: { equals: matchLabel, mode: "insensitive" }, section: { title: { equals: matchRoom, mode: "insensitive" } } },
    },
    select: { value: true },
  });
  if (matchedAnswer?.value?.trim()) {
    return `notes: "${matchedAnswer.value.trim()}"`;
  }

  return null;
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  // Accept either a single photoUrl (back-compat) or photoUrls (array) — always normalise to an array
  const photoUrls: string[] = body.photoUrls || (body.photoUrl ? [body.photoUrl] : []);
  const { context, provider: requestedProvider, identifyRoom, existingNotes, inspectionId, matchRoom, matchLabel } = body;

  // Whether recommendations are appropriate depends on the inspection type: a check-in/
  // check-out inventory needs to stay a strictly factual condition record (see the no-
  // recommendations rule below - this is what a client flagged as a real issue when maintenance-
  // style suggestions showed up in an inventory report), while a mid-term, HMO, legionella, or
  // maintenance inspection is exactly the context where a recommendation is genuinely useful.
  // Defaults to the safer "no recommendations" behavior whenever the type can't be positively
  // confirmed (no inspectionId provided, inspection not found, etc) rather than assuming
  // permission that was never actually established.
  //
  // Also doubles as the inspection lookup identifyRoom mode needs below (for excludedSectionIds)
  // - fetched once here rather than as two separate round-trips for the same inspectionId.
  let allowRecommendations = false;
  let checkInContext: string | null = null;
  let inspectionForContext: {
    type: string;
    excludedSectionIds: string | null;
    propertyId: string;
    comparedToInspectionId: string | null;
    completedDate: Date | null;
  } | null = null;
  if (inspectionId) {
    try {
      inspectionForContext = await prisma.inspection.findFirst({
        where: { id: inspectionId, property: { companyId: (session.user as any).companyId || undefined }, deletedAt: null },
        select: { type: true, excludedSectionIds: true, propertyId: true, comparedToInspectionId: true, completedDate: true },
      });
      if (inspectionForContext && inspectionForContext.type !== "check-in" && inspectionForContext.type !== "check-out") {
        allowRecommendations = true;
      }

      // For a check-out inspection specifically, pull in the matching item/field's condition
      // from the check-in report (when a specific room + item/field name to match against was
      // provided), so the AI can genuinely compare current condition against what was recorded
      // when the tenant moved in - the actual point of a check-out report - rather than
      // describing current state with no reference point at all. Never applies to check-in
      // itself, since there's nothing prior to compare against yet.
      // Skipped when the inspector has given an explicit instruction via existingNotes below
      // (e.g. "is the tap leaking?") - that mode already tells the AI to focus narrowly on
      // answering the specific thing asked, and appending a second, separate "also compare
      // against check-in" task on top of that would pull the response in a different
      // direction than what was actually requested. The inspector's deliberate, specific
      // question takes priority over this automatic, background comparison.
      const hasExplicitInstruction = !identifyRoom && !!(existingNotes && existingNotes.trim());
      if (inspectionForContext?.type === "check-out" && !identifyRoom && !hasExplicitInstruction && matchRoom && matchLabel) {
        checkInContext = await findCheckInContext(inspectionForContext, matchRoom, matchLabel, (session.user as any).companyId || null);
      }
    } catch (err) {
      console.error("Failed to look up inspection for recommendation eligibility:", err);
    }
  }

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
  if (identifyRoom && inspectionId && inspectionForContext) {
    try {
      const excludedIds: string[] = inspectionForContext.excludedSectionIds ? JSON.parse(inspectionForContext.excludedSectionIds) : [];

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
      referenceImages = await Promise.all(capped.map(async (ref) => ({ label: ref.label, ...(await fetchAndResize(ref.url, 700)) })));
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
      (allowRecommendations
        ? "Where there's a genuine defect, you may add a brief, practical recommendation for addressing it (e.g. 're-seal recommended', 'requires professional repair') - keep it short and practical, not the main focus of the entry, and only when there's an actual defect to act on. "
        : "Describe the defect itself, not what should be done about it - never suggest repairs, recommend action, or advise what should be done; that call belongs to the inspector, not you. ") +
      'The label for each entry MUST be a room or area name (e.g. "Bathroom", "Bedroom", "Kitchen", "Living room", "Hallway") — never a surface or material name like "Wall" or "Ceiling" as a substitute for actually naming the room. If cues are weak, still commit to your best-guess room type rather than falling back to describing the surface instead. ' +
      'Format each entry as: "Room: description." — one line per photo, no "Photo N" numbering. If a photo shows nothing concerning, say so plainly rather than inventing an issue. ' +
      "Do not add a summary, conclusion, or any text after the last entry." +
      referenceInstruction
    : "You help a property inspector document the condition of an item or area from photos, for an inventory/condition report, to speed up their report writing — you are assisting, not replacing their judgement. " +
      "If the inspector has given you a specific instruction to follow (this will be made clear further below), prioritise answering or acting on that directly over giving a generic description. Otherwise, describe what's visible as set out below. " +
      (multiple
        ? "You'll be shown multiple photos of the same item/area — some may be different angles of one single issue, but with many photos it's just as likely there are several genuinely different, distinct issues visible across them (a crack in one photo, staining in another, a separate defect in a third). Don't assume it's all one situation just because it's one batch — actually look at what's different across the photos. "
        : "") +
      "Describe only what's visibly present — the surface/material and the specific defect if any (cracking, staining, damage, wear, etc). " +
      "Never guess at a cause you can't actually see in the image(s) (e.g. don't claim a pipe burst if you only see a stain — say the stain pattern instead, and that the cause needs on-site investigation). " +
      (allowRecommendations
        ? "This is a mid-term, HMO, legionella, or maintenance inspection, not a check-in/check-out inventory - where there's a genuine defect, you may add a brief, practical recommendation for addressing it (e.g. 're-seal recommended', 'requires professional repair'). Keep it short and practical, not the main focus of the response, and only when there's an actual defect to act on. "
        : "IMPORTANT: this is a factual inventory/condition record, not a maintenance recommendation. State only what is observed - never suggest repairs, recommend action, advise what should be done, or use phrasing like 'should be repaired', 'recommend replacing', or 'requires attention'. Describing the defect itself (e.g. 'the seal shows visible cracking') is correct; telling the reader what to do about it is not this report's job. ") +
      "If nothing concerning is visible, say so plainly rather than inventing an issue. Write as continuous prose in one unbroken paragraph — never use headers, bold section titles, or bullet points, even if there's a lot to cover across several photos; weave everything into flowing sentences instead. " +
      "IMPORTANT: never omit a real, distinct, visible issue just to keep the response short — the right length depends entirely on how much is actually there. A few photos of one situation might genuinely only need 2-4 sentences; many photos covering several different, real issues should get one clear sentence or clause per distinct issue, however many that ends up being. Don't pad or invent detail to sound thorough, but don't compress multiple genuinely different problems into one vague sentence either — a report that leaves something out is worse than one that runs a bit longer.";

  const notesHint =
    existingNotes && existingNotes.trim()
      ? identifyRoom
        ? `\n\nThe inspector has already noted: "${existingNotes.trim()}" — use this alongside the visual cues to help identify which room each photo is likely from, if relevant.`
        : `\n\nThe inspector has written this as an instruction for you to follow, not just background text: "${existingNotes.trim()}" — use the photo(s) to directly address it. If it's a question (e.g. "is the tap leaking?" or "check the seal"), answer it plainly based on what's visible. If it names something specific to check or describe, focus your response on that rather than giving a generic overview of the whole photo. If what's visible doesn't let you answer with confidence, say so plainly rather than guessing.`
      : "";

  const userPrompt =
    (context ? `Context: ${context}\n\n` : "") +
    (identifyRoom
      ? `Describe ${images.length > 1 ? `each of these ${images.length} photos` : "this photo"} for a maintenance report, identifying the likely room for each.`
      : multiple
      ? `Describe these ${images.length} photos together for this report.`
      : "Describe this photo for this report.") +
    notesHint +
    (checkInContext
      ? `\n\nAt check-in, this was recorded as: ${checkInContext}. Compare what you actually see now against this. If it looks consistent with the check-in record, say so briefly. If you can see something that looks like new damage, wear, or a change not reflected in the check-in notes, describe that distinctly from what was already there - don't blend the two into one vague description. If the check-in notes are too vague or brief to compare against with any real confidence, just describe current condition normally rather than inventing a comparison you can't actually support from what's visible.`
      : "");

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
          max_tokens: 3000,
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
      // If this ever fires despite the safety margin above (an even larger batch than
      // planned for, or an unusually verbose response), at least it's visible in logs rather
      // than silently returning an incomplete, cut-off result with no trace of what happened.
      if (data.stop_reason === "max_tokens") {
        console.error(`[analyze-photo] Response hit the token limit and was cut off (${images.length} photo(s), identifyRoom=${!!identifyRoom})`);
      }
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
      if (data.choices?.[0]?.finish_reason === "length") {
        console.error(`[analyze-photo] Response hit the token limit and was cut off (${images.length} photo(s), identifyRoom=${!!identifyRoom})`);
      }
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
