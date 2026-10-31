import { scopeCompanyId } from "@/lib/access";
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { findMatchingCheckInInspection, findMatchingCheckInItem } from "@/lib/findMatchingCheckIn";
import { aiRateLimit } from "@/lib/aiGuard";
import { validatePhotoUrl } from "@/lib/photoUrl";
import { fetchAndResizeImage, resizeForVision } from "@/lib/fetchAndResizeImage";
import { fetchPhotoBuffer } from "@/lib/photoUrl";
import { makeTiles } from "@/lib/photoTiles";
import { detailsHints } from "@/lib/photoDetails";
import { analysePhotos } from "@/lib/photoAnalysis";
import { pickProvider } from "@/lib/ai/vision";

// Allow this route more time on Vercel — a 30-photo batch takes longer than the 10s default.
export const maxDuration = 60;

// Anthropic's API supports up to 100 images per request (32MB total). Above 20 images the
// per-image max dimension drops to 2000px, but we already resize to 1568px, so we're safely
// under that regardless. Capped well below the hard limit for safety margin.
const MAX_PHOTOS = 40;
// A DETAILED analysis looks closely at each photo (close-up crops, two passes with the stronger model), so it takes few photos at a time: attention
// per photo is what makes it detailed. The screen sends four at a time; the server holds the line in case something else calls it.
const MAX_DETAILED_PHOTOS = 8;
const MAX_TILE_PHOTOS = 4; // close-up crops are made for the first four photos of a request
const DETAILED_COST = 3; // a detailed photo costs about three ordinary ones, and counts that way against the limits

// Finds the check-in record for the same room + item/field a check-out photo is being
// analysed for, so the AI can compare current condition against what was actually recorded
// when the tenant moved in, rather than describing current state with no reference point.
async function findCheckInContext(
  currentInspection: { propertyId: string; comparedToInspectionId: string | null; completedDate: Date | null },
  matchRoom: string,
  matchLabel: string,
  companyId: string | null
): Promise<{ text: string; photoUrls: string[] } | null> {
  const checkIn = await findMatchingCheckInInspection(currentInspection, companyId);
  if (!checkIn) return null;

  const matchedItem = await findMatchingCheckInItem(checkIn.id, matchRoom, matchLabel);
  if (matchedItem) {
    const parts = [`condition recorded as "${matchedItem.condition || "not recorded"}"`];
    if (matchedItem.cleanliness) parts.push(`cleanliness "${matchedItem.cleanliness}"`);
    parts.push(`notes: ${matchedItem.notes?.trim() ? `"${matchedItem.notes.trim()}"` : "none recorded"}`);
    return { text: parts.join(", "), photoUrls: (matchedItem.photos ?? []).map((p: { url: string }) => p.url).filter((u: unknown): u is string => typeof u === "string") };
  }

  // Falls back to a matching field answer (e.g. a room's "Comments" field) if no inventory
  // item matched - covers the other place AI analysis runs, on a Comments field rather than
  // a specific inventory item.
  const matchedAnswer = await prisma.fieldAnswer.findFirst({
    where: {
      inspectionId: checkIn.id,
      field: { label: { equals: matchLabel, mode: "insensitive" }, section: { title: { equals: matchRoom, mode: "insensitive" } } },
    },
    select: { value: true, photos: { select: { url: true }, orderBy: { timestamp: "asc" } } },
  });
  if (matchedAnswer?.value?.trim()) {
    return { text: `notes: "${matchedAnswer.value.trim()}"`, photoUrls: (matchedAnswer.photos ?? []).map((p: { url: string }) => p.url).filter((u: unknown): u is string => typeof u === "string") };
  }

  return null;
}

const text = (v: unknown, max: number): string | undefined => (typeof v === "string" ? v.slice(0, max) : undefined);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "That request couldn't be read" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "That request couldn't be read" }, { status: 400 });
  }

  // Accept either a single photoUrl (back-compat) or photoUrls (array) - always normalise to an array
  const photoUrls: unknown = body.photoUrls ?? (body.photoUrl ? [body.photoUrl] : []);
  if (!Array.isArray(photoUrls) || photoUrls.length === 0) {
    return NextResponse.json({ error: "Missing photo(s)" }, { status: 400 });
  }
  if (photoUrls.length > MAX_PHOTOS) {
    return NextResponse.json({ error: `Please analyse ${MAX_PHOTOS} or fewer photos at once` }, { status: 400 });
  }
  // The server downloads these, so only ProptMate's own photo storage is accepted - never an address of someone's choosing.
  const urls: string[] = [];
  for (const u of photoUrls) {
    const check = validatePhotoUrl(u);
    if (!check.ok) return NextResponse.json({ error: "Photos must be uploaded through ProptMate to be analysed" }, { status: 400 });
    urls.push(check.url);
  }

  // Three modes, chosen strictly (anything else is the ordinary one, so odd values can never select a costlier mode by accident):
  // standard = the quick model, one pass; deep = the stronger model, one pass; detailed = the stronger model, close-up crops of large
  // photos, and a first pass that lists everything before the description is written.
  const mode: "standard" | "deep" | "detailed" = body.depth === "detailed" ? "detailed" : body.depth === "deep" ? "deep" : "standard";
  const detailed = mode === "detailed";
  const deep = mode !== "standard";
  if (detailed && urls.length > MAX_DETAILED_PHOTOS) {
    return NextResponse.json({ error: `A detailed analysis takes up to ${MAX_DETAILED_PHOTOS} photos at a time` }, { status: 400 });
  }
  // The stronger models are costlier, so they only run when asked for - and have their own, tighter limits. A detailed analysis is sent four photos at
  // a time, so a big set is many requests: it has its own allowance (the photo allowance below still counts each photo three times).
  if (deep) {
    // a detailed analysis also has a daily ceiling for the whole company (300 requests, about 1,200 photos), so it cannot quietly run up a large bill
    const limited = await aiRateLimit(session, detailed ? "analyze-detailed" : "analyze-deep", { max: detailed ? 40 : 20, windowMin: 15, ...(detailed ? { companyDaily: 300 } : {}) });
    if (limited) return limited;
  }
  // Every analysis costs money, so the number of requests AND the number of photos are limited, per person and per company.
  const limitedRequests = await aiRateLimit(session, "analyze-photo-requests", { max: 60, windowMin: 15 });
  if (limitedRequests) return limitedRequests;
  const limitedPhotos = await aiRateLimit(session, "analyze-photo", { max: 600, windowMin: 15, cost: urls.length * (detailed ? DETAILED_COST : 1), companyDaily: 6000, usage: detailed ? "analyze-photo-detailed" : deep ? "analyze-photo-deep" : "analyze-photo" });
  if (limitedPhotos) return limitedPhotos;

  const context = text(body.context, 2000);
  const existingNotes = text(body.existingNotes, 4000);
  const inspectionId = text(body.inspectionId, 100);
  const matchRoom = text(body.matchRoom, 200);
  const matchLabel = text(body.matchLabel, 200);
  const identifyRoom = !!body.identifyRoom;
  const requestedProvider = body.provider;

  const provider = pickProvider(requestedProvider);
  if (!provider) {
    return NextResponse.json(
      { error: "AI analysis isn't configured yet — add OPENAI_API_KEY or ANTHROPIC_API_KEY to your environment." },
      { status: 503 }
    );
  }

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
  let checkInPhotoUrls: string[] = [];
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
        where: { id: inspectionId, property: { companyId: scopeCompanyId((session.user as any).companyId) }, deletedAt: null },
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
        const found = await findCheckInContext(inspectionForContext, matchRoom, matchLabel, (session.user as any).companyId || null);
        checkInContext = found?.text ?? null;
        checkInPhotoUrls = found?.photoUrls ?? [];
      }
    } catch (err) {
      console.error("Failed to look up inspection for recommendation eligibility:", err);
    }
  }

  // Fetch and resize every image in parallel - doing this one at a time would be genuinely slow for a 20-30+ photo batch
  // and risks a timeout. Resizing also fixes photos that exceed the vision API's max dimensions (a full-resolution phone
  // photo can be 4000px+ on a side), and removes the photo's hidden data, including its GPS location.
  let images: { base64: string; mediaType: string }[];
  let tiles: { photo: number; label: string; base64: string; mediaType: string }[] = [];
  try {
    if (detailed) {
      // download each photo once: the whole photo for the AI as usual, and close-up crops of the large ones (small ones are already seen in full)
      const buffers = await Promise.all(urls.map((url) => fetchPhotoBuffer(url)));
      images = await Promise.all(buffers.map((b) => resizeForVision(b, 1568)));
      const cropped = await Promise.all(buffers.slice(0, MAX_TILE_PHOTOS).map((b) => makeTiles(b)));
      tiles = cropped.flatMap((ts, photo) => ts.map((t) => ({ photo, ...t })));
    } else {
      images = await Promise.all(urls.map((url) => fetchAndResizeImage(url, 1568, { restrictToStorage: true })));
    }
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
      referenceImages = await Promise.all(capped.map(async (ref) => ({ label: ref.label, ...(await fetchAndResizeImage(ref.url, 700)) })));
    } catch (err) {
      // Reference photos are a nice-to-have, not required — fall back to guessing without
      // them rather than failing the whole analysis if this lookup has a problem.
      console.error("Couldn't load reference photos:", err);
    }
  }

  // At a check-out, the photos taken at check-in of the same item are shown to the AI too, so it can say what has actually
  // changed rather than describing the item with nothing to compare against. A few smaller photos are plenty; and these
  // are a bonus, so if any cannot be loaded the analysis simply goes ahead without them.
  const checkInImages: { base64: string; mediaType: string }[] = [];
  if (checkInPhotoUrls.length > 0) {
    const loaded = await Promise.allSettled(checkInPhotoUrls.slice(0, 3).map((url) => fetchAndResizeImage(url, 1024)));
    for (const l of loaded) if (l.status === "fulfilled") checkInImages.push(l.value);
  }

  const result = await analysePhotos({
    images,
    referenceImages,
    checkInImages,
    provider,
    deep,
    // every mode now asks for the full range of detail; the detailed mode adds the first pass and the close-up crops
    coverage: true,
    detailed,
    tiles,
    identifyRoom,
    allowRecommendations,
    context,
    existingNotes,
    checkInContext,
    keys: { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY },
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  // wordingWarnings is only present when an inventory answer still contains advice or a "not tested" remark after the
  // automatic rewrite, so the screen can point it out instead of letting it through unnoticed.
  return NextResponse.json({
    description: result.description,
    wasTruncated: result.wasTruncated,
    ...(result.comparedWithCheckIn > 0 ? { comparedWithCheckIn: result.comparedWithCheckIn } : {}),
    ...(result.wordingWarnings.length > 0 ? { wordingWarnings: result.wordingWarnings } : {}),
    // for the inspector, separate from the report text: readable labels, safety notes, and where a closer photo would show more
    ...(detailed ? { detailPass: result.detailPass } : {}),
    ...(result.details ? { hints: detailsHints(result.details) } : {}),
  });
}
