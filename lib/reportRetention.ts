// How long a replaced report PDF is kept, and which of them the clean-up may remove. Pure, so it is tested without a database.
export const REPORT_RETENTION_DAYS = 90;

export type SupersededRow = { id: string; url: string; supersededAt: Date | string };

export function retentionCutoff(now: Date, days: number = REPORT_RETENTION_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// Splits the replaced PDFs older than the retention period into the ones to delete and the ones that must be kept for good
// (still the current report, or the exact file a confirmation request was sent with).
export function planCleanup(rows: SupersededRow[], protectedUrls: Iterable<string>, now: Date, days: number = REPORT_RETENTION_DAYS): { remove: SupersededRow[]; keep: SupersededRow[] } {
  const cutoff = retentionCutoff(now, days).getTime();
  const guard = new Set(protectedUrls);
  const remove: SupersededRow[] = [], keep: SupersededRow[] = [];
  for (const r of rows) {
    const t = new Date(r.supersededAt).getTime();
    if (!Number.isFinite(t) || t > cutoff) continue; // too recent (or unreadable): leave it alone for now
    (guard.has(r.url) ? keep : remove).push(r);
  }
  return { remove, keep };
}
