import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { findMatchingCheckInInspection, findMatchingCheckInItem } from "@/lib/findMatchingCheckIn";
import { CONDITION_LABELS } from "@/lib/inventoryConditions";
import { callVisionTool, loadImages, parseDepth, pickProvider, type Img, type Part } from "@/lib/ai/vision";
import { ASSESS_SCHEMA, ASSESS_SYSTEM, normaliseAssessment } from "@/lib/ai/assessItem";

export const maxDuration = 60;

const MAX_PHOTOS = 8;
const MAX_CHECKIN_PHOTOS = 4;

// Suggests a condition, a cleanliness and a factual description for ONE inventory item from its
// own photos - and, for a check-out, compares them with the matching check-in item's photos. The
// photos are always read from the database by item id, never taken from the request, so this
// can't be made to fetch an arbitrary address or to read another company's photos.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ error: "Missing item" }, { status: 400 });

  const depth = parseDepth(body?.depth);
  const provider = pickProvider(body?.provider);
  if (!provider) return NextResponse.json({ error: "AI analysis isn't set up yet" }, { status: 503 });

  // Deep analysis costs more per use, so it gets a tighter limit.
  const limit = await checkRateLimit(`${depth === "deep" ? "assess-deep" : "assess"}:${session.user.id}`, depth === "deep" ? 20 : 60, 15);
  if (!limit.allowed) {
    return NextResponse.json({ error: "That's a lot of AI requests - please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) } });
  }

  const item = await prisma.inspectionItem.findFirst({
    where: { id: itemId, inspection: { property: { companyId }, deletedAt: null } },
    select: {
      id: true,
      room: true,
      itemName: true,
      inspection: { select: { type: true, propertyId: true, comparedToInspectionId: true, completedDate: true } },
      photos: { select: { url: true }, orderBy: { timestamp: "asc" } },
    },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.photos.length === 0) return NextResponse.json({ error: "Add at least one photo of this item first" }, { status: 400 });

  // For anything after check-in, look for the same item as it was recorded at check-in.
  let checkInUrls: string[] = [];
  let checkInText: string | null = null;
  if (body?.compare !== false && item.inspection.type !== "check-in") {
    const checkIn = await findMatchingCheckInInspection(item.inspection, companyId);
    const match = checkIn ? await findMatchingCheckInItem(checkIn.id, item.room, item.itemName) : null;
    if (match) {
      checkInUrls = match.photos.map((p: { url: string }) => p.url).slice(0, MAX_CHECKIN_PHOTOS);
      const bits = [`condition recorded as "${CONDITION_LABELS[match.condition] || match.condition || "not recorded"}"`];
      if (match.cleanliness) bits.push(`cleanliness "${match.cleanliness}"`);
      if (match.notes?.trim()) bits.push(`notes: "${match.notes.trim()}"`);
      checkInText = bits.join(", ");
    }
  }

  let current: Img[];
  let past: Img[];
  try {
    [current, past] = await Promise.all([loadImages(item.photos.map((p: { url: string }) => p.url).slice(0, MAX_PHOTOS)), loadImages(checkInUrls)]);
  } catch (err) {
    console.error("Failed to load photos for item assessment:", err);
    return NextResponse.json({ error: "Couldn't load one or more photos" }, { status: 502 });
  }

  const parts: Part[] = [{ type: "text", text: `Item: ${item.itemName}\nRoom: ${item.room}\nInspection type: ${item.inspection.type}` }];
  if (checkInText) {
    parts.push({
      type: "text",
      text: `CHECK-IN record for this same item - ${checkInText}.${past.length > 0 ? ` The next ${past.length} photo(s) were taken at check-in:` : " There are no check-in photos to compare against."}`,
    });
    for (const image of past) parts.push({ type: "image", image });
  }
  parts.push({ type: "text", text: `CURRENT photos (${current.length}) of the item as it is now:` });
  for (const image of current) parts.push({ type: "image", image });
  parts.push({ type: "text", text: "Give your assessment now using the tool." });

  const result = await callVisionTool({
    provider,
    depth,
    system: ASSESS_SYSTEM,
    parts,
    toolName: "record_assessment",
    toolDescription: "Record the proposed condition, cleanliness and factual description for this item.",
    schema: ASSESS_SCHEMA,
    maxTokens: 1500,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const comparedPhotos = past.length > 0;
  const assessment = normaliseAssessment(result.data, comparedPhotos);
  if (!assessment) return NextResponse.json({ error: "The AI's answer wasn't usable - please try again" }, { status: 502 });

  return NextResponse.json({ ...assessment, depth, photosUsed: current.length, checkIn: checkInText ? { photos: past.length } : null });
}
