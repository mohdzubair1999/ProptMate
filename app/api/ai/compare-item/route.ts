import { recordAiUsage } from "@/lib/aiUsage";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { findMatchingCheckInInspection, findMatchingCheckInItem } from "@/lib/findMatchingCheckIn";
import { callVisionTool, loadImages, parseDepth, pickProvider, type Part } from "@/lib/ai/vision";
import { COMPARE_SCHEMA, COMPARE_SYSTEM, normaliseComparison } from "@/lib/ai/compareItem";

export const maxDuration = 60;
const MAX_PHOTOS = 4;

// Compares the check-out photos of ONE item with the check-in photos of the same item and saves what changed on the item. Photos are always read from the database by item id (never from the request).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (!itemId) return NextResponse.json({ error: "Missing item" }, { status: 400 });

  const provider = pickProvider(body?.provider);
  if (!provider) return NextResponse.json({ error: "AI analysis isn't set up yet" }, { status: 503 });
  const depth = parseDepth(body?.depth);

  // A whole check-out is a few dozen items, so the limit is generous but still there.
  const limit = await checkRateLimit(`compare-item:${session.user.id}`, 150, 15);
  if (!limit.allowed) return NextResponse.json({ error: "That's a lot of AI requests - please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) } });

  const item = await prisma.inspectionItem.findFirst({
    where: { id: itemId, inspection: { property: { companyId }, deletedAt: null } },
    select: { id: true, room: true, itemName: true, inspection: { select: { type: true, propertyId: true, comparedToInspectionId: true, completedDate: true } }, photos: { select: { url: true }, orderBy: { timestamp: "asc" } } },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  if (item.inspection.type === "check-in") return NextResponse.json({ error: "Only a later inspection can be compared with its check-in" }, { status: 400 });

  const save = async (c: { kind: string; summary: string; severity: string | null; confidence: string }) => {
    await prisma.inspectionItem.update({ where: { id: item.id }, data: { changeKind: c.kind, changeSummary: c.summary, changeSeverity: c.severity, changeConfidence: c.confidence, changeComparedAt: new Date() } });
  };

  if (item.photos.length === 0) {
    const c = { kind: "cannot_compare", summary: "There are no check-out photos of this item to compare.", severity: null, confidence: "high" };
    await save(c);
    return NextResponse.json({ ...c, findings: [] });
  }
  const checkIn = await findMatchingCheckInInspection(item.inspection, companyId);
  const match = checkIn ? await findMatchingCheckInItem(checkIn.id, item.room, item.itemName) : null;
  if (!match || match.photos.length === 0) {
    const c = { kind: "cannot_compare", summary: match ? "The matching check-in item has no photos to compare with." : "No item with the same room and name was found at check-in.", severity: null, confidence: "high" };
    await save(c);
    return NextResponse.json({ ...c, findings: [] });
  }

  await recordAiUsage(companyId, "compare-item");
  let before, after;
  try {
    [before, after] = await Promise.all([loadImages(match.photos.map((p: { url: string }) => p.url).slice(0, MAX_PHOTOS)), loadImages(item.photos.map((p: { url: string }) => p.url).slice(0, MAX_PHOTOS))]);
  } catch (err) {
    console.error("Failed to load photos for comparison:", err);
    return NextResponse.json({ error: "Couldn't load one or more photos" }, { status: 502 });
  }

  const parts: Part[] = [{ type: "text", text: `Item: ${item.itemName}\nRoom: ${item.room}\n\nCHECK-IN photos (${before.length}):` }];
  for (const image of before) parts.push({ type: "image", image });
  parts.push({ type: "text", text: `CHECK-OUT photos (${after.length}) of the same item:` });
  for (const image of after) parts.push({ type: "image", image });
  parts.push({ type: "text", text: "Say what has visibly changed, using the tool." });

  const result = await callVisionTool({ provider, depth, system: COMPARE_SYSTEM, parts, toolName: "record_comparison", toolDescription: "Record what visibly changed between the check-in and check-out photos.", schema: COMPARE_SCHEMA, maxTokens: 1200 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  const comparison = normaliseComparison(result.data);
  if (!comparison) return NextResponse.json({ error: "The AI's answer wasn't usable - please try again" }, { status: 502 });
  await save(comparison);
  return NextResponse.json(comparison);
}
