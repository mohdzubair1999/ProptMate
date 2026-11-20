// Tenancy-end automation, the decisions only (no database): when the check-out should be, whether it already exists, when to remind.
const DAY = 24 * 60 * 60 * 1000;

export function checkOutDate(tenancyEnd: Date | undefined | null, daysBefore: number): Date | null {
  if (!(tenancyEnd instanceof Date) || Number.isNaN(tenancyEnd.getTime())) return null;
  const d = Number.isFinite(daysBefore) ? Math.min(60, Math.max(0, Math.floor(daysBefore))) : 0;
  return new Date(tenancyEnd.getTime() - d * DAY);
}

// A check-out already planned for about the same time means the event is a repeat (or the agent made it by hand): do not add a second one.
export function alreadyHasCheckOut(existing: { type: string; status: string; scheduledDate: Date | null }[], target: Date, windowDays = 14): boolean {
  return existing.some((i) => i.type === "check-out" && i.status !== "completed" && (!i.scheduledDate || Math.abs(i.scheduledDate.getTime() - target.getTime()) <= windowDays * DAY));
}

// Which check-outs to remind about today: still a draft, scheduled from now up to `daysAhead` days away (or just passed by a day), not reminded yet.
export function dueForReminder(i: { type: string; status: string; scheduledDate: Date | null; checkOutReminderSentAt: Date | null }, now: Date, daysAhead = 3): boolean {
  if (i.type !== "check-out" || i.status !== "draft" || !i.scheduledDate || i.checkOutReminderSentAt) return false;
  const ms = i.scheduledDate.getTime() - now.getTime();
  return ms <= daysAhead * DAY && ms >= -1 * DAY;
}

export function checkOutEmail(opts: { address: string; when: Date | null; tenantName?: string | null; created?: boolean }): { subject: string; lines: string[] } {
  const date = opts.when ? opts.when.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }) : "a date still to be set";
  const lines = [opts.created ? `A check-out has been scheduled automatically because the tenancy at ${opts.address} is ending.` : `Reminder: a check-out is coming up at ${opts.address}.`, "", `Property: ${opts.address}`, `Date: ${date}`];
  if (opts.tenantName) lines.push(`Tenant: ${opts.tenantName}`);
  lines.push("", "Open ProptMate, then Inspections, to start it. The check-in report is already linked, so you can compare as you go.", "", "The ProptMate team");
  return { subject: opts.created ? `Check-out scheduled: ${opts.address}` : `Check-out reminder: ${opts.address}`, lines };
}
