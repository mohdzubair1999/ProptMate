import { del } from "@vercel/blob";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { onlyBlobUrls, chunk } from "@/lib/blobUrls";

// Every stored file that belongs to a set of inspections (photos, the report PDF, the exact PDF sent for confirmation).
// Read BEFORE the database rows are deleted, then handed to deleteBlobs AFTER the deletion has succeeded.
export async function fileUrlsForInspections(where: Prisma.InspectionWhereInput): Promise<string[]> {
  const [itemPhotos, answerPhotos, reports, acks] = await Promise.all([
    prisma.photo.findMany({ where: { inspectionItem: { inspection: where } }, select: { url: true } }),
    prisma.photo.findMany({ where: { fieldAnswer: { inspection: where } }, select: { url: true } }),
    prisma.report.findMany({ where: { inspection: where }, select: { pdfUrl: true } }),
    prisma.reportAcknowledgement.findMany({ where: { inspection: where }, select: { pdfUrlSnapshot: true } }),
  ]);
  return onlyBlobUrls([...itemPhotos.map((p) => p.url), ...answerPhotos.map((p) => p.url), ...reports.map((r) => r.pdfUrl), ...acks.map((a) => a.pdfUrlSnapshot)]);
}

export async function fileUrlsForCompliance(propertyWhere: Prisma.PropertyWhereInput): Promise<string[]> {
  const docs = await prisma.complianceDocument.findMany({ where: { property: propertyWhere, documentUrl: { not: null } }, select: { documentUrl: true } });
  return onlyBlobUrls(docs.map((d) => d.documentUrl));
}

// Best effort and never throws: the records are already gone, so a file that will not delete is only logged.
export async function deleteBlobs(urls: string[]): Promise<{ deleted: number; failed: number }> {
  const list = onlyBlobUrls(urls);
  let deleted = 0, failed = 0;
  for (const part of chunk(list, 100)) {
    try { await del(part); deleted += part.length; } catch (err) { failed += part.length; console.error("[file cleanup] could not delete some files:", err); }
  }
  return { deleted, failed };
}
