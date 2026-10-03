"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { put } from "@vercel/blob";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { InspectionReportDocument, type ReportData } from "@/lib/pdf/InspectionReportDocument";
import { TemplateReportDocument, type TemplateReportData } from "@/lib/pdf/TemplateReportDocument";

// react-pdf can't reliably fetch remote URLs itself during server-side rendering — the same
// issue we hit and fixed for AI vision analysis. Fetch and embed each photo as a data URI
// instead, so the PDF always has the actual image bytes rather than a URL it has to resolve.
async function fetchPhotoBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.error("Failed to fetch photo for report:", url, err);
    return null;
  }
}

// Separated from fetching so a retry at a more aggressive compression tier can re-compress
// the same already-downloaded bytes rather than re-fetching from the source every time.
async function compressBuffer(buffer: Buffer, maxDimension: number, quality: number): Promise<{ dataUri: string; sizeBytes: number } | null> {
  try {
    const resized = await sharp(buffer)
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    const dataUri = `data:image/jpeg;base64,${resized.toString("base64")}`;
    return { dataUri, sizeBytes: dataUri.length };
  } catch (err) {
    console.error("Failed to compress photo for report:", err);
    return null;
  }
}

// Compression tiers to try in order, least to most aggressive. Tried against the same
// already-fetched raw bytes each time — cheap to retry since no network round-trip is
// repeated, just re-running the resize/encode step with tighter settings. The last two are a
// genuine last resort for very large inspections (hundreds of photos) where even 400px/q40
// isn't enough — still legible for a quick check, meaningfully smaller than not compressing.
const COMPRESSION_TIERS: [number, number][] = [
  [1000, 80],
  [800, 70],
  [650, 60],
  [500, 50],
  [400, 40],
  [300, 35],
  [220, 30],
];

// 25MB is the actual target (matching the email attachment limit), but base64 encoding
// itself adds roughly 33% over the raw compressed bytes, and the target here is measured
// on the already-base64-encoded data URI length — so aiming for 20MB of encoded photo data
// leaves real margin for that overhead plus the PDF's own text and layout, not just headroom
// against a number that's already accounting for encoding.
const TARGET_TOTAL_PHOTO_BYTES = 20 * 1024 * 1024;

// Fetches every photo's raw bytes exactly once, then measures the actual total size at each
// compression tier — starting from the least aggressive — until one genuinely fits under the
// target, rather than guessing from photo count alone which tier "should" be small enough.
// Falls back to the most aggressive tier if even that doesn't fit, since a report that's
// still too large after every tier is better served by the email's own size check (which
// omits the attachment entirely) than by degrading photos further into uselessness.
async function resolveAllPhotos<TItem extends { photos: { id: string; url: string }[] }, TAnswer extends { photos: { id: string; url: string }[] }>(
  items: TItem[],
  answers: TAnswer[]
): Promise<{ items: TItem[]; answers: TAnswer[] }> {
  type PhotoRef = { id: string; url: string; buffer: Buffer | null };
  const allPhotoRefs: PhotoRef[] = [];
  for (const entry of items) for (const p of entry.photos) allPhotoRefs.push({ id: p.id, url: p.url, buffer: null });
  for (const entry of answers) for (const p of entry.photos) allPhotoRefs.push({ id: p.id, url: p.url, buffer: null });

  console.log(`[report photo] Fetching ${allPhotoRefs.length} photo(s) once, then measuring actual compressed size at each tier`);

  await Promise.all(
    allPhotoRefs.map(async (ref) => {
      ref.buffer = await fetchPhotoBuffer(ref.url);
    })
  );
  const fetchFailures = allPhotoRefs.filter((r) => !r.buffer).length;
  if (fetchFailures > 0) {
    console.error(`[report photo] ${fetchFailures} of ${allPhotoRefs.length} photo(s) failed to download and will be skipped`);
  }

  // Skip straight to a more realistic starting tier for a large photo count, rather than
  // always starting at the least aggressive setting — a genuinely large inspection is
  // overwhelmingly unlikely to fit at full quality, so starting there just burns a full
  // compression pass across every photo before ever reaching a tier with a real chance of
  // fitting. This is a coarse starting guess only; the loop below still measures the actual
  // result at each tier from here and keeps stepping down if it doesn't fit, so a wrong guess
  // here costs at most one extra pass, never an incorrect final result.
  const photoCount = allPhotoRefs.filter((r) => r.buffer).length;
  const startTierIndex = photoCount > 200 ? 3 : photoCount > 80 ? 1 : 0;

  let chosenResults: Map<string, string> = new Map(); // photo id -> data URI

  for (const [maxDimension, quality] of COMPRESSION_TIERS.slice(startTierIndex)) {
    const compressed = await Promise.all(
      allPhotoRefs
        .filter((r) => r.buffer)
        .map(async (r) => ({ id: r.id, result: await compressBuffer(r.buffer!, maxDimension, quality) }))
    );
    const totalBytes = compressed.reduce((sum, c) => sum + (c.result?.sizeBytes || 0), 0);
    console.log(`[report photo] Tier ${maxDimension}px/q${quality}: ${(totalBytes / 1024 / 1024).toFixed(1)}MB total across ${compressed.length} photo(s)`);

    const isLastTier = maxDimension === COMPRESSION_TIERS[COMPRESSION_TIERS.length - 1][0];
    if (totalBytes <= TARGET_TOTAL_PHOTO_BYTES || isLastTier) {
      chosenResults = new Map(compressed.filter((c) => c.result).map((c) => [c.id, c.result!.dataUri]));
      console.log(`[report photo] Using tier ${maxDimension}px/q${quality}${isLastTier && totalBytes > TARGET_TOTAL_PHOTO_BYTES ? " (most aggressive available, still over target)" : ""}`);
      break;
    }
  }

  const applyResults = <T extends { photos: { id: string; url: string }[] }>(list: T[]): T[] =>
    list.map((entry) => {
      const resolvedPhotos = entry.photos
        .map((p) => ({ ...p, embeddedUrl: chosenResults.get(p.id) || null, url: p.url }))
        .filter((p) => !!p.embeddedUrl);
      return { ...entry, photos: resolvedPhotos };
    });

  return { items: applyResults(items), answers: applyResults(answers) };
}

export async function generateReport(formData: FormData) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;

  const inspectionId = String(formData.get("inspectionId") || "");

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
    include: {
      property: true,
      inspector: true,
      items: { include: { photos: true }, orderBy: { room: "asc" } },
      template: {
        include: {
          sections: {
            where: { hidden: false },
            orderBy: { order: "asc" },
            include: { fields: { where: { hidden: false }, orderBy: { order: "asc" } } },
          },
        },
      },
      answers: { include: { photos: true, field: true } },
    },
  });

  if (!inspection) throw new Error("Inspection not found");
  if (inspection.status !== "completed") throw new Error("Mark the inspection complete before generating the report");

  // Resolve every photo to an embedded data URI up front — fetches each once, then measures
  // the actual compressed size at increasingly aggressive tiers until the total genuinely
  // fits, rather than guessing a tier from photo count alone.
  const totalPhotoCount = inspection.items.reduce((sum, i) => sum + i.photos.length, 0) + inspection.answers.reduce((sum, a) => sum + a.photos.length, 0);
  console.log(`[report photo] Inspection has ${inspection.items.length} item(s) and ${inspection.answers.length} answer(s), ${totalPhotoCount} photo(s) total to check`);

  const { items: resolvedItems, answers: resolvedAnswers } = await resolveAllPhotos(inspection.items, inspection.answers);

  // Prefer a dedicated "front cover" field if the template has one (added via the Front
  // Cover quick-add block) — much more reliable than just grabbing whatever photo happens
  // to be first. Falls back to the first photo found anywhere if no such field exists.
  const dedicatedCover = resolvedAnswers.find(
    (a: any) => a.field?.label?.toLowerCase().includes("front cover") && a.photos.length > 0
  );

  const coverPhoto =
    dedicatedCover?.photos[0] ||
    resolvedItems.find((i) => i.photos.length > 0)?.photos[0] ||
    resolvedAnswers.find((a) => a.photos.length > 0)?.photos[0] ||
    null;

  const coverPhotoOriginalUrl = coverPhoto?.url || null;
  // Re-compressed separately at consistently high quality, regardless of which tier was
  // chosen above for the rest of the report — the cover is displayed at full A4 page size,
  // unlike the small 120x120pt inline thumbnails, so it needs meaningfully more resolution to
  // still look sharp, while its own size barely moves the total PDF weight either way since
  // it's a single photo, not one of potentially hundreds.
  const coverPhotoRawBuffer = coverPhotoOriginalUrl ? await fetchPhotoBuffer(coverPhotoOriginalUrl) : null;
  const coverPhotoUrl = coverPhotoRawBuffer ? (await compressBuffer(coverPhotoRawBuffer, 1400, 85))?.dataUri || null : null;
  const coverPhotoLinkUrl = coverPhoto?.url || null;

  let buffer: Buffer;

  if (inspection.template) {
    // Same per-inspection "Hide" exclusions the live editing view respects — without this,
    // a section hidden just for this one report would still show up in the generated PDF.
    const excludedIds: string[] = inspection.excludedSectionIds ? JSON.parse(inspection.excludedSectionIds) : [];
    const visibleSections = inspection.template.sections.filter((s) => !excludedIds.includes(s.id));

    const templateData: TemplateReportData = {
      property: inspection.property,
      type: inspection.type,
      templateName: inspection.template.name,
      completedDate: inspection.completedDate,
      inspector: inspection.inspector,
      sections: visibleSections,
      answers: resolvedAnswers,
      inventoryItems: resolvedItems,
      aiSummary: inspection.aiSummary,
      coverPhotoUrl,
      coverPhotoLinkUrl,
      generatedAt: new Date(),
      summaryReference: {
        propertyDescription: inspection.propertyDescription,
        clientName: inspection.clientName,
        clientAddress: inspection.clientAddress,
        otherAlarmLocation: inspection.otherAlarmLocation,
        otherAlarmTested: inspection.otherAlarmTested,
        boilerLocation: inspection.boilerLocation,
        stopcockLocation: inspection.stopcockLocation,
        fuseBoxLocation: inspection.fuseBoxLocation,
      },
    };
    try {
      buffer = await renderToBuffer(TemplateReportDocument({ data: templateData }));
    } catch (err) {
      console.error(`[report generate] PDF rendering failed for inspection ${inspectionId}:`, err);
      throw new Error("Couldn't generate the PDF report. Please try again — if this keeps happening, let support know.");
    }
  } else {
    const reportData: ReportData = {
      property: inspection.property,
      type: inspection.type,
      status: inspection.status,
      scheduledDate: inspection.scheduledDate,
      completedDate: inspection.completedDate,
      inspector: inspection.inspector,
      items: resolvedItems,
      aiSummary: inspection.aiSummary,
      coverPhotoUrl,
      coverPhotoLinkUrl,
      generatedAt: new Date(),
      summaryReference: {
        propertyDescription: inspection.propertyDescription,
        clientName: inspection.clientName,
        clientAddress: inspection.clientAddress,
        otherAlarmLocation: inspection.otherAlarmLocation,
        otherAlarmTested: inspection.otherAlarmTested,
        boilerLocation: inspection.boilerLocation,
        stopcockLocation: inspection.stopcockLocation,
        fuseBoxLocation: inspection.fuseBoxLocation,
      },
    };
    try {
      buffer = await renderToBuffer(InspectionReportDocument({ data: reportData }));
    } catch (err) {
      console.error(`[report generate] PDF rendering failed for inspection ${inspectionId}:`, err);
      throw new Error("Couldn't generate the PDF report. Please try again — if this keeps happening, let support know.");
    }
  }

  // The property address, proper report type name, and completion date - exactly as the
  // person actually reads them elsewhere in the app (matches the same names used in email
  // subjects), not a lowercased, hyphenated slug. Only strips characters that would genuinely
  // break the file path (/ and \); everything else is left as-is for real readability.
  //
  // The date is required, not cosmetic: without it, two different inspections of the same
  // type for the same property (e.g. a mid-term inspection in January and another in June)
  // would produce the identical filename - and combined with allowOverwrite below, the later
  // one would silently overwrite the earlier one's actual PDF content at that shared path,
  // even though each inspection has its own separate database record pointing at that same,
  // now-corrupted URL.
  const sanitizeForPath = (s: string) => s.replace(/[/\\]/g, "-").trim();
  const reportDate = (inspection.completedDate || new Date()).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const reportFilename = `${sanitizeForPath(inspection.property.address)} - ${sanitizeForPath(inspectionTypeDisplayName(inspection.type))} (${reportDate}).pdf`;

  let blob;
  try {
    blob = await put(`inspection-reports/${reportFilename}`, buffer, {
      access: "public",
      contentType: "application/pdf",
      // The filename is now stable (same address + report type every time, no timestamp) so
      // that it stays readable, but that means regenerating the same inspection's report
      // produces the identical path each time. Vercel Blob refuses to overwrite an existing
      // file at the same path by default - this is deliberate: a regeneration is meant to
      // replace the previous file at that same name, not fail or accumulate duplicates.
      allowOverwrite: true,
    });
  } catch (err) {
    console.error(`[report generate] Blob upload failed for inspection ${inspectionId}:`, err);
    throw new Error("Couldn't save the generated PDF report. Please try again — if this keeps happening, let support know.");
  }

  await prisma.report.upsert({
    where: { inspectionId },
    update: { pdfUrl: blob.url, generatedAt: new Date() },
    create: { inspectionId, pdfUrl: blob.url },
  });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Deletes a generated report record. The PDF file itself stays in Blob storage (cheap,
// harmless to leave) — this just removes the report link so a new one can be generated.
export async function deleteReport(formData: FormData) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;

  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.report.deleteMany({ where: { inspectionId } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}
