import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { aiRateLimit } from "@/lib/aiGuard";
import { callVisionTool, loadImages, pickProvider, type Img, type Part } from "@/lib/ai/vision";
import { fetchAndResizeImage } from "@/lib/fetchAndResizeImage";
import { findHazardFields } from "@/lib/hazardFields";
import { HAZARD_TOOL, buildHazardPrompt, hazardSchema, normaliseHazard } from "@/lib/hazardAssess";

export const maxDuration = 60;
const MAX_PHOTOS = 6;
const MAX_PREVIOUS = 3;

const niceDate = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }).format(d) : null);

// Suggests answers for the damp and mould part of a mid-term inspection from its own photos, and (when there is an earlier visit
// with photos of the same section) says whether it looks better or worse. A guide only: it never changes the record itself.
// The photos and the field options are always read from the database, never taken from the request, so this cannot be made to
// fetch an arbitrary address, to read another company's photos, or to offer answers the template does not have.
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
  const photoFieldId = typeof body?.photoFieldId === "string" ? body.photoFieldId : "";
  const hint = typeof body?.compareToInspectionId === "string" && body.compareToInspectionId ? body.compareToInspectionId : null;
  if (!inspectionId || !photoFieldId) return NextResponse.json({ error: "Missing details" }, { status: 400 });

  const provider = pickProvider(undefined);
  if (!provider) return NextResponse.json({ error: "AI analysis isn't set up yet" }, { status: 503 });
  const limited = await aiRateLimit(session, "assess-hazard", { max: 30, windowMin: 15, companyDaily: 400, usage: "assess-hazard" });
  if (limited) return limited;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, deletedAt: null, property: { companyId } },
    select: { id: true, templateId: true, propertyId: true },
  });
  if (!inspection || !inspection.templateId) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

  // The section and its fields come from THIS inspection's own template.
  const field = await prisma.templateField.findFirst({
    where: { id: photoFieldId, type: "PHOTO", section: { templateId: inspection.templateId } },
    select: { id: true, label: true, section: { select: { title: true, fields: { where: { hidden: false }, orderBy: { order: "asc" }, select: { id: true, label: true, type: true, options: true } } } } },
  });
  if (!field) return NextResponse.json({ error: "That section was not found" }, { status: 404 });
  const hf = findHazardFields(field.section.title, field.section.fields, field.id);
  if (!hf) return NextResponse.json({ error: "This isn't a damp and mould section" }, { status: 400 });

  const wanted = [hf.photoFieldId, hf.severityFieldId, hf.locationFieldId].filter((x): x is string => !!x);
  const answers = await prisma.fieldAnswer.findMany({
    where: { inspectionId: inspection.id, fieldId: { in: wanted } },
    select: { fieldId: true, value: true, photos: { select: { url: true }, orderBy: { timestamp: "asc" } } },
  });
  const urls: string[] = (answers.find((a: { fieldId: string }) => a.fieldId === hf.photoFieldId)?.photos ?? []).map((p: { url: string }) => p.url).slice(0, MAX_PHOTOS);
  if (urls.length === 0) return NextResponse.json({ error: "Add at least one photo of the affected area first" }, { status: 400 });
  const currentSeverity: string | null = answers.find((a: { fieldId: string }) => a.fieldId === hf.severityFieldId)?.value ?? null;

  // The earlier visit with photos of this same section: the one chosen for comparison if it has some, otherwise the last mid-term.
  const labelOf = (id: string | null) => field.section.fields.find((f: { id: string }) => f.id === id)?.label.trim().toLowerCase() ?? null;
  const sevLabel = labelOf(hf.severityFieldId), locLabel = labelOf(hf.locationFieldId);
  const candidates: { id: string; completedDate: Date | null; createdAt: Date }[] = [];
  // NOT: this inspection must never be its own comparison, even when the request names it (a separate key, so naming an id cannot overwrite it)
  const base = { propertyId: inspection.propertyId, deletedAt: null, NOT: { id: inspection.id }, property: { companyId } };
  if (hint) {
    const c = await prisma.inspection.findFirst({ where: { ...base, id: hint }, select: { id: true, completedDate: true, createdAt: true } });
    if (c) candidates.push(c);
  }
  const last = await prisma.inspection.findFirst({ where: { ...base, status: "completed", type: "mid-term" }, orderBy: { completedDate: "desc" }, select: { id: true, completedDate: true, createdAt: true } });
  if (last && !candidates.some((c) => c.id === last.id)) candidates.push(last);

  let previous: { date: string | null; severity: string | null; extent: string | null; urls: string[] } | null = null;
  for (const c of candidates) {
    const prevAnswers = await prisma.fieldAnswer.findMany({
      where: { inspectionId: c.id, field: { section: { title: { equals: field.section.title, mode: "insensitive" } } } },
      select: { value: true, photos: { select: { url: true }, orderBy: { timestamp: "asc" } }, field: { select: { label: true, type: true } } },
    });
    const photoAns = prevAnswers.find((a: { field: { type: string }; photos: unknown[] }) => a.field.type === "PHOTO" && a.photos.length > 0);
    if (!photoAns) continue;
    const textOf = (label: string | null) => (label ? prevAnswers.find((a: { field: { label: string }; value: string | null }) => a.field.label.trim().toLowerCase() === label)?.value?.trim() || null : null);
    previous = { date: niceDate(c.completedDate ?? c.createdAt), severity: textOf(sevLabel), extent: textOf(locLabel), urls: photoAns.photos.map((p: { url: string }) => p.url).slice(0, MAX_PREVIOUS) };
    break;
  }

  let current: Img[];
  try {
    current = await loadImages(urls);
  } catch (err) {
    console.error("Failed to load photos for the damp and mould assessment:", err);
    return NextResponse.json({ error: "Couldn't load one or more photos" }, { status: 502 });
  }
  // The earlier photos are a bonus: any that cannot be loaded are simply left out, and with none there is no comparison.
  const past: Img[] = [];
  if (previous) for (const l of await Promise.allSettled(previous.urls.map((u) => fetchAndResizeImage(u, 1024)))) if (l.status === "fulfilled") past.push(l.value);

  const prompt = buildHazardPrompt({
    sectionTitle: field.section.title,
    severityOptions: hf.severityOptions,
    previous: previous && past.length > 0 ? { date: previous.date, severity: previous.severity, extent: previous.extent, photoCount: past.length } : null,
    currentCount: current.length,
  });
  const parts: Part[] = [];
  if (past.length > 0) {
    parts.push({ type: "text", text: `PREVIOUS visit photos (${past.length}):` });
    for (const image of past) parts.push({ type: "image", image });
  }
  parts.push({ type: "text", text: `CURRENT photos (${current.length}):` });
  for (const image of current) parts.push({ type: "image", image });
  parts.push({ type: "text", text: prompt.userText });

  const result = await callVisionTool({ provider, depth: "standard", system: prompt.system, parts, toolName: HAZARD_TOOL, toolDescription: prompt.toolDescription, schema: hazardSchema(hf.severityOptions), maxTokens: 1100 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const suggestion = normaliseHazard(result.data, { severityOptions: hf.severityOptions, signsOptions: hf.signsOptions, currentSeverity, hadPrevious: past.length > 0 });
  return NextResponse.json({
    suggestion,
    previous: previous && past.length > 0 ? { date: previous.date, severity: previous.severity, extent: previous.extent } : null,
    photosUsed: current.length,
    previousPhotosUsed: past.length,
  });
}
