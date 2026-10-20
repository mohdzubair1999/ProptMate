import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { callVisionTool, loadImages, parseDepth, pickProvider, type Img, type Part } from "@/lib/ai/vision";
import { IDENTIFY_SCHEMA, IDENTIFY_SYSTEM, normaliseSuggestions } from "@/lib/ai/identifyItems";

export const maxDuration = 60;

const MAX_PHOTOS = 12;

// Proposes the item list for ONE room from that room's own photos (the photos added to the room's
// Photos section). It only suggests - nothing is added until the person ticks items and confirms.
// Photos are read from the database by inspection and section, never taken from the request.
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
  const inspectionId = typeof body?.inspectionId === "string" ? body.inspectionId : "";
  const sectionId = typeof body?.sectionId === "string" ? body.sectionId : "";
  if (!inspectionId || !sectionId) return NextResponse.json({ error: "Missing details" }, { status: 400 });

  const depth = parseDepth(body?.depth);
  const provider = pickProvider(body?.provider);
  if (!provider) return NextResponse.json({ error: "AI analysis isn't set up yet" }, { status: 503 });

  const limit = await checkRateLimit(`${depth === "deep" ? "identify-deep" : "identify"}:${session.user.id}`, depth === "deep" ? 15 : 30, 15);
  if (!limit.allowed) {
    return NextResponse.json({ error: "That's a lot of AI requests - please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds ?? 60) } });
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, deletedAt: null, property: { companyId } },
    select: { id: true, templateId: true },
  });
  if (!inspection || !inspection.templateId) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

  // The section must belong to this inspection's own template.
  const section = await prisma.templateSection.findFirst({
    where: { id: sectionId, templateId: inspection.templateId },
    select: { id: true, title: true },
  });
  if (!section) return NextResponse.json({ error: "Room not found" }, { status: 404 });

  const answers = await prisma.fieldAnswer.findMany({
    where: { inspectionId: inspection.id, field: { sectionId: section.id, type: "PHOTO" } },
    select: { photos: { select: { url: true }, orderBy: { timestamp: "asc" } } },
  });
  const urls = answers.flatMap((a: { photos: { url: string }[] }) => a.photos.map((p: { url: string }) => p.url)).slice(0, MAX_PHOTOS);
  if (urls.length === 0) return NextResponse.json({ error: "Add photos to this room's Photos section first, then try again." }, { status: 400 });

  // Names already on this room's list, so they aren't suggested again.
  const inventoryFields = await prisma.templateField.findMany({ where: { sectionId: section.id, type: "INVENTORY_SECTION" }, select: { id: true } });
  const existing = inventoryFields.length
    ? await prisma.inspectionItem.findMany({ where: { inspectionId: inspection.id, templateFieldId: { in: inventoryFields.map((f: { id: string }) => f.id) } }, select: { itemName: true } })
    : [];
  const existingNames = existing.map((i: { itemName: string }) => i.itemName);

  let images: Img[];
  try {
    images = await loadImages(urls);
  } catch (err) {
    console.error("Failed to load photos for item identification:", err);
    return NextResponse.json({ error: "Couldn't load one or more photos" }, { status: 502 });
  }

  const parts: Part[] = [
    {
      type: "text",
      text: `Room: ${section.title}\nItems already on the list (do not repeat these): ${existingNames.length ? existingNames.join("; ") : "none yet"}\n\nHere are ${images.length} photo(s) of this room:`,
    },
  ];
  for (const image of images) parts.push({ type: "image", image });
  parts.push({ type: "text", text: "List the items you can see using the tool." });

  const result = await callVisionTool({
    provider,
    depth,
    system: IDENTIFY_SYSTEM,
    parts,
    toolName: "list_items",
    toolDescription: "List the distinct inventory items visible in the room's photos.",
    schema: IDENTIFY_SCHEMA,
    maxTokens: 3000,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const items = normaliseSuggestions(result.data as { items?: unknown }, existingNames);
  return NextResponse.json({ items, depth, photosUsed: images.length });
}
