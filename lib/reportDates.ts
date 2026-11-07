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
