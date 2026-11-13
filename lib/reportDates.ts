// The one date a report shows for when the inspection was done. It is the date the inspection was FIRST completed: amending a completed inspection (as many times
// as needed) never changes it, and a report does not carry a second "amended" date. (Who amended, why and when is kept in the audit log.)
// An inspection that was never amended has no separate first date, so its own completion date is used.
type D = Date | string | null | undefined;
const asDate = (v: D): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
export function reportCompletedDate(i: { firstCompletedDate?: D; completedDate?: D } | null | undefined): Date | null {
  if (!i || typeof i !== "object") return null;
  return asDate(i.firstCompletedDate) ?? asDate(i.completedDate);
}

const toValidDate = (v: unknown): Date | null => { const d = v instanceof Date ? v : typeof v === "string" || typeof v === "number" ? new Date(v) : null; return d && Number.isFinite(d.getTime()) ? d : null; };
// True when the inspection was completed AGAIN after the report was generated (it was edited and finished again), so the report does not show the latest changes yet.
export function reportIsStale(generatedAt: unknown, completedDate: unknown): boolean {
  const g = toValidDate(generatedAt), c = toValidDate(completedDate);
  return !!g && !!c && c.getTime() > g.getTime() + 1000;
}
