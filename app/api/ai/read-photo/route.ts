import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { aiRateLimit } from "@/lib/aiGuard";
import { callVisionTool, pickProvider, type Img, type Part } from "@/lib/ai/vision";
import { fetchAndResizeImage } from "@/lib/fetchAndResizeImage";
import { findMeterFields, targetFor } from "@/lib/meterFields";
import { LABEL_SYSTEM, LABEL_TOOL, METER_SYSTEM, METER_TOOL, labelSchema, meterSchema, normaliseLabel, normaliseMeter } from "@/lib/readingAssess";

export const maxDuration = 60;
const MAX_PHOTOS = 3;
const SIZE = 2000; // text on a meter or a rating plate is small: a larger image than the 1568 used for ordinary photos

// Reads a utility meter, or an appliance rating plate, from the photos already attached in the inspection, and SUGGESTS the values.
// It never saves anything. Photos, section fields and item details are always read from the database, never taken from the request,
// so this cannot be made to fetch an arbitrary address or to read another company's photos.
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
  const kind = body?.kind === "meter" || body?.kind === "label" ? body.kind : null;
  if (!kind) return NextResponse.json({ error: "Missing details" }, { status: 400 });
  const inspectionId = typeof body?.inspectionId === "string" ? body.inspectionId : "";
  const photoFieldId = typeof body?.photoFieldId === "string" ? body.photoFieldId : "";
  const itemId = typeof body?.itemId === "string" ? body.itemId : "";
  if (kind === "meter" ? !inspectionId || !photoFieldId : !itemId) return NextResponse.json({ error: "Missing details" }, { status: 400 });

  const provider = pickProvider(undefined);
  if (!provider) return NextResponse.json({ error: "AI analysis isn't set up yet" }, { status: 503 });
  const limited = await aiRateLimit(session, "read-photo", { max: 60, windowMin: 15, companyDaily: 600, usage: "read-photo" });
  if (limited) return limited;

  let urls: string[] = [];
  let meterTargets: ReturnType<typeof findMeterFields> = null;
  let itemName = "";

  if (kind === "meter") {
    const inspection = await prisma.inspection.findFirst({ where: { id: inspectionId, deletedAt: null, property: { companyId } }, select: { id: true, templateId: true } });
    if (!inspection || !inspection.templateId) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
    const field = await prisma.templateField.findFirst({
      where: { id: photoFieldId, type: "PHOTO", section: { templateId: inspection.templateId } },
      select: { id: true, section: { select: { title: true, fields: { where: { hidden: false }, orderBy: { order: "asc" }, select: { id: true, label: true, type: true } } } } },
    });
    if (!field) return NextResponse.json({ error: "That section was not found" }, { status: 404 });
    meterTargets = findMeterFields(field.section.title, field.section.fields, field.id);
    if (!meterTargets) return NextResponse.json({ error: "This isn't a meter-readings section" }, { status: 400 });
    const answer = await prisma.fieldAnswer.findFirst({ where: { inspectionId: inspection.id, fieldId: photoFieldId }, select: { photos: { select: { url: true }, orderBy: { timestamp: "desc" }, take: MAX_PHOTOS } } });
    urls = (answer?.photos ?? []).map((p: { url: string }) => p.url);
  } else {
    const item = await prisma.inspectionItem.findFirst({
      where: { id: itemId, inspection: { deletedAt: null, property: { companyId } } },
      select: { itemName: true, photos: { select: { url: true }, orderBy: { timestamp: "desc" }, take: MAX_PHOTOS } },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    urls = item.photos.map((p: { url: string }) => p.url);
    itemName = String(item.itemName ?? "").slice(0, 80);
  }
  if (urls.length === 0) return NextResponse.json({ error: kind === "meter" ? "Add a clear photo of the meter first" : "Add a close photo of the label first" }, { status: 400 });

  const loaded = await Promise.allSettled(urls.map((u) => fetchAndResizeImage(u, SIZE)));
  const images: Img[] = loaded.filter((l): l is PromiseFulfilledResult<Img> => l.status === "fulfilled").map((l) => l.value);
  if (images.length === 0) return NextResponse.json({ error: "Couldn't load the photo" }, { status: 502 });

  const parts: Part[] = images.map((image) => ({ type: "image", image }));
  parts.push({ type: "text", text: kind === "meter" ? `Read the meter in ${images.length === 1 ? "this photo" : `these ${images.length} photos (the same meter)`} using the tool.` : `Read the appliance label in ${images.length === 1 ? "this photo" : `these ${images.length} photos`} using the tool. The item is recorded as "${itemName}".` });

  const result = await callVisionTool({
    provider,
    depth: "deep",
    system: kind === "meter" ? METER_SYSTEM : LABEL_SYSTEM,
    parts,
    toolName: kind === "meter" ? METER_TOOL : LABEL_TOOL,
    toolDescription: kind === "meter" ? "Report the meter's type and the digits clearly visible on it." : "Report the make, model and other details clearly printed on the label.",
    schema: kind === "meter" ? meterSchema() : labelSchema(),
    maxTokens: 700,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (kind === "meter") {
    const suggestion = normaliseMeter(result.data);
    const t = meterTargets ? targetFor(meterTargets, suggestion.meterType === "unknown" ? "unknown" : suggestion.meterType) : null;
    return NextResponse.json({ kind, suggestion, target: t ? { readingFieldId: t.reading, serialFieldId: t.serial } : null, photosUsed: images.length });
  }
  return NextResponse.json({ kind, suggestion: normaliseLabel(result.data), photosUsed: images.length });
}
