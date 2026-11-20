import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { planCleanup, retentionCutoff, REPORT_RETENTION_DAYS } from "@/lib/reportRetention";

// Remembers a report PDF that has just been replaced, so the daily clean-up can remove it once it is old enough. Never throws: it must not break generating a report.
export async function rememberSupersededPdf(oldUrl: string | null | undefined, newUrl: string | null | undefined): Promise<void> {
  if (!oldUrl || oldUrl === newUrl) return;
  try {
    await prisma.supersededReportPdf.upsert({ where: { url: oldUrl }, update: {}, create: { url: oldUrl } });
  } catch (err) {
    console.error("[report cleanup] could not note a replaced PDF:", err);
  }
}

// Deletes replaced PDFs older than the retention period, except any a confirmation request points at or that is a current report. Returns what it did.
export async function runReportCleanup(now: Date = new Date()): Promise<{ removed: number; kept: number; failed: number }> {
  const rows = await prisma.supersededReportPdf.findMany({ where: { supersededAt: { lte: retentionCutoff(now, REPORT_RETENTION_DAYS) } }, orderBy: { supersededAt: "asc" }, take: 200 });
  if (rows.length === 0) return { removed: 0, kept: 0, failed: 0 };
  const urls = rows.map((r) => r.url);
  const [acks, current] = await Promise.all([
    prisma.reportAcknowledgement.findMany({ where: { pdfUrlSnapshot: { in: urls } }, select: { pdfUrlSnapshot: true } }),
    prisma.report.findMany({ where: { pdfUrl: { in: urls } }, select: { pdfUrl: true } }),
  ]);
  const protectedUrls = [...acks.map((a) => a.pdfUrlSnapshot), ...current.map((c) => c.pdfUrl).filter((u): u is string => !!u)];
  const { remove, keep } = planCleanup(rows, protectedUrls, now);
  let removed = 0, failed = 0;
  for (const r of remove) {
    try {
      await del(r.url);
      await prisma.supersededReportPdf.delete({ where: { id: r.id } });
      removed++;
    } catch (err) {
      failed++; // left in the list, tried again tomorrow
      console.error("[report cleanup] could not delete", r.url, err);
    }
  }
  if (keep.length) await prisma.supersededReportPdf.deleteMany({ where: { id: { in: keep.map((k) => k.id) } } }); // protected for good: stop tracking, keep the file
  return { removed, kept: keep.length, failed };
}
