// When to email about a property's next inspection. The daily job used to match exact days (14 days before, and the day itself), which
// meant a missed run lost the reminder, and nothing was ever sent once an inspection was overdue. Now each property remembers which
// reminder it has had for its CURRENT due date, so each is sent once, a missed day is caught up on the next run, and a property that
// goes overdue is told so. Pure (no database, no clock): the caller passes today's date.
//
//   stage 0: nothing sent yet for this due date
//   stage 1: "due soon" sent (within 14 days of the due date)
//   stage 2: "due now" sent (the due date has arrived or passed)
//   stage 3: "two weeks overdue" sent (the last reminder for this due date)

export const SOON_DAYS = 14;
export const OVERDUE_DAYS = 14;
export type ReminderKind = "soon" | "due" | "overdue";
export type ReminderState = { due: Date | null; stage: number };
export type ReminderDecision = { send: ReminderKind | null; state: ReminderState; daysUntil: number };

const DAY = 86_400_000;
// a real date (checked by what it is, not by which Date class made it, so a value from another place still counts) that is a valid moment
const isDate = (v: unknown): v is Date => Object.prototype.toString.call(v) === "[object Date]" && Number.isFinite(+(v as Date));
export const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
export const daysBetweenDates = (from: Date, to: Date) => dayNumber(to) - dayNumber(from);

// `due` is the property's computed next-inspection date (null when there is none); `stored` is what was recorded last time.
// The decision says what to send now (at most ONE kind per run) and what to store if it is sent; the caller stores it only once the
// email has really gone, so a failed send is simply tried again on the next run.
export function decideReminder(due: Date | null, stored: ReminderState, today: Date): ReminderDecision {
  const none: ReminderDecision = { send: null, state: stored, daysUntil: 0 };
  if (!isDate(due)) return none;
  const daysUntil = daysBetweenDates(today, due);
  // a different due date than the one reminded about is a new cycle (the last inspection was done): start again from stage 0
  const sameCycle = isDate(stored?.due) && dayNumber(stored.due) === dayNumber(due);
  const stage = sameCycle ? Math.max(0, Math.min(3, Math.trunc(Number(stored.stage)) || 0)) : 0;
  const mk = (send: ReminderKind, newStage: number): ReminderDecision => ({ send, state: { due, stage: newStage }, daysUntil });
  // the most advanced reminder that is now due and not yet sent (so a run after a gap jumps straight to the right one, never sending
  // three emails at once)
  if (daysUntil <= -OVERDUE_DAYS && stage < 3) return mk("overdue", 3);
  if (daysUntil <= 0 && stage < 2) return mk("due", 2);
  if (daysUntil > 0 && daysUntil <= SOON_DAYS && stage < 1) return mk("soon", 1);
  // nothing to send; but remember the cycle we are in if it changed, so a stale stage from an earlier cycle cannot linger
  return { send: null, state: sameCycle ? stored : { due, stage: 0 }, daysUntil };
}

export function describeDue(kind: ReminderKind, address: string, due: Date, daysUntil: number): string {
  const when = due.toLocaleDateString("en-GB");
  if (kind === "soon") return `- ${address} is due for inspection in ${daysUntil} day${daysUntil === 1 ? "" : "s"} (${when}).`;
  if (kind === "due") return daysUntil === 0 ? `- ${address} is due for inspection TODAY (${when}).` : `- ${address} was due for inspection on ${when} (${-daysUntil} day${-daysUntil === 1 ? "" : "s"} ago) and has not been inspected.`;
  return `- ${address} is now ${-daysUntil} days overdue for inspection (it was due on ${when}).`;
}
