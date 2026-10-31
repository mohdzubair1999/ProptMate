import { decideReminder as D, dayNumber, daysBetweenDates as DB, describeDue as DD, SOON_DAYS, OVERDUE_DAYS, type ReminderState } from "../lib/inspectionReminders";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const d = (s: string) => new Date(s + "T09:00:00"); const none: ReminderState = { due: null, stage: 0 };
ok("the windows are 14 days before and 14 days overdue", SOON_DAYS === 14 && OVERDUE_DAYS === 14);
ok("whole days between dates ignore the time of day", DB(new Date("2026-05-01T23:59:00"), new Date("2026-05-02T00:01:00")) === 1 && DB(new Date("2026-05-01T00:01:00"), new Date("2026-05-01T23:59:00")) === 0 && DB(d("2026-05-10"), d("2026-05-01")) === -9);
// ---------- single decisions ----------
let r = D(d("2026-06-30"), none, d("2026-06-01")); ok("30 days before: nothing yet", r.send === null && r.daysUntil === 29, r);
r = D(d("2026-06-30"), none, d("2026-06-16")); ok("exactly 14 days before: 'soon', and the stage moves to 1", r.send === "soon" && r.state.stage === 1 && r.daysUntil === 14, r);
r = D(d("2026-06-30"), none, d("2026-06-20")); ok("10 days before with nothing sent: 'soon' (a missed run is caught up, not lost)", r.send === "soon" && r.state.stage === 1, r);
r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: 1 }, d("2026-06-20")); ok("'soon' already sent for this due date: nothing, so no duplicate", r.send === null && r.state.stage === 1, r);
r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: 1 }, d("2026-06-30")); ok("on the day: 'due' (TODAY)", r.send === "due" && r.state.stage === 2 && r.daysUntil === 0, r);
r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: 1 }, d("2026-07-05")); ok("5 days late and the day was missed: 'due' (it is now overdue, said so)", r.send === "due" && r.daysUntil === -5, r);
r = D(d("2026-06-30"), none, d("2026-07-05")); ok("never reminded and already 5 days overdue: goes straight to 'due', not 'soon' as well", r.send === "due" && r.state.stage === 2, r);
r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: 2 }, d("2026-07-10")); ok("overdue 10 days, 'due' already sent: nothing", r.send === null, r);
r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: 2 }, d("2026-07-14")); ok("14 days overdue: the 'two weeks overdue' reminder, stage 3", r.send === "overdue" && r.state.stage === 3 && r.daysUntil === -14, r);
r = D(d("2026-06-30"), none, d("2026-09-01")); ok("never reminded and 63 days overdue: ONE reminder (the most advanced), not three", r.send === "overdue" && r.state.stage === 3, r);
r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: 3 }, d("2026-12-01")); ok("all three sent: never another, however overdue (no nagging forever)", r.send === null && r.state.stage === 3, r);
r = D(d("2026-12-30"), { due: d("2026-06-30"), stage: 3 }, d("2026-12-16")); ok("a NEW due date (the last inspection was done): the old stage is forgotten and a fresh 'soon' is sent", r.send === "soon" && r.state.stage === 1 && +r.state.due! === +d("2026-12-30"), r);
r = D(d("2026-12-30"), { due: d("2026-06-30"), stage: 3 }, d("2026-10-01")); ok("a new due date far away: nothing sent, but the new cycle is remembered at stage 0", r.send === null && r.state.stage === 0 && +r.state.due! === +d("2026-12-30"), r);
for (const due of [null, undefined, new Date("nope"), "2026-06-30", 5] as any[]) { r = D(due, { due: d("2026-06-30"), stage: 2 }, d("2026-07-01")); ok(`no usable due date (${String(due)}): nothing, state untouched`, r.send === null && r.state.stage === 2); }
for (const st of [-5, 99, NaN, 1.7, "2" as any, null as any]) { r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: st }, d("2026-06-30")); ok(`a corrupt stored stage (${String(st)}) never crashes or skips an overdue reminder wrongly`, r.send === "due" || r.send === null, r); }
r = D(d("2026-06-30"), { due: d("2026-06-30"), stage: 3 }, d("2026-06-30")); ok("the stored due date is compared by DAY (a different time on the same day is the same cycle)", r.send === null && r.state.stage === 3);
// ---------- the wording ----------
ok("wording: soon (singular and plural), TODAY, days ago, overdue", /in 1 day \(/.test(DD("soon", "1 Road", d("2026-06-30"), 1)) && /in 14 days/.test(DD("soon", "1 Road", d("2026-06-30"), 14)) && /due for inspection TODAY/.test(DD("due", "1 Road", d("2026-06-30"), 0)) && /was due for inspection on 30\/06\/2026 \(5 days ago\) and has not been inspected/.test(DD("due", "1 Road", d("2026-06-30"), -5)) && /\(1 day ago\)/.test(DD("due", "1 Road", d("2026-06-30"), -1)) && /now 14 days overdue/.test(DD("overdue", "1 Road", d("2026-06-30"), -14)), [DD("due", "1 Road", d("2026-06-30"), -5)]);
// ---------- simulate a year of daily runs, including runs that never happen ----------
let bad = 0, totalSent = 0, caught = 0;
for (let trial = 0; trial < 1500; trial++) {
  let seed = trial * 7919 + 13; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const start = new Date(2026, 0, 1), skipChance = [0, 0.1, 0.4, 0.8][trial % 4];
  let state: ReminderState = { due: null, stage: 0 }; let due = new Date(2026, 0, 1 + Math.floor(rnd() * 90)); const sent: { kind: string; dueKey: number; day: number }[] = [], attempts: { kind: string; dueKey: number; day: number }[] = [];
  let completedAt: number | null = null;
  for (let day = 0; day < 400; day++) {
    const today = new Date(start.getFullYear(), start.getMonth(), start.getDate() + day);
    // sometimes the inspection gets done: the next due date moves 6 months on, and a new cycle begins
    if (rnd() < 0.004 && day > 20) { due = new Date(today.getFullYear(), today.getMonth() + 6, today.getDate()); completedAt = day; }
    if (rnd() < skipChance) continue; // the daily job did not run today
    const dec = D(due, state, today);
    if (dec.send) {
      attempts.push({ kind: dec.send, dueKey: dayNumber(due), day });
      if (rnd() < 0.05) continue; // the email failed to send: the new state is NOT stored, so it is tried again next run
      sent.push({ kind: dec.send, dueKey: dayNumber(due), day }); totalSent++; // delivered
      state = dec.state;
    } else state = dec.state;
  }
  // invariants over the whole year
  const byDue = new Map<number, string[]>(); for (const s of sent) byDue.set(s.dueKey, [...(byDue.get(s.dueKey) ?? []), s.kind]);
  // what was actually DELIVERED: at most 3 per due date, never the same kind twice, and always in the order soon, due, overdue
  const rank: Record<string, number> = { soon: 0, due: 1, overdue: 2 };
  for (const kinds of byDue.values()) { if (kinds.length > 3) bad++; if (new Set(kinds).size !== kinds.length) bad++; for (let i = 1; i < kinds.length; i++) if (rank[kinds[i]] <= rank[kinds[i - 1]]) bad++; }
  // never an email more than 14 days before a due date, and 'soon' only before it, 'due'/'overdue' only on or after it
  for (const s of attempts) { const du = s.dueKey - dayNumber(new Date(start.getFullYear(), start.getMonth(), start.getDate() + s.day)); if (s.kind === "soon" && !(du > 0 && du <= 14)) bad++; if (s.kind === "due" && !(du <= 0)) bad++; if (s.kind === "overdue" && !(du <= -14)) bad++; }
  // with the job running most days, an overdue due date is never left without at least one email once it has passed by a day or more
  if (skipChance === 0) { const lastDue = dayNumber(due); const finalDay = dayNumber(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 399)); if (finalDay - lastDue >= 1 && completedAt === null) { /* due date passed during the year: expect a 'due' */ const passedInYear = lastDue >= dayNumber(start); if (passedInYear && !(byDue.get(lastDue) ?? []).some((k) => k === "due" || k === "overdue")) bad++; } }
}
ok(`1,500 simulated years of daily runs (some runs never happen, some emails fail, inspections get done and the due date moves): never more than 3 emails per due date, 'soon' only in the 14 days before, 'due' only on or after the day, 'overdue' only 14+ days late, and a property that goes past its due date always hears about it (${totalSent} emails in total)`, bad === 0, bad);
// when the job runs every day with no failures: exactly one email of each kind per due date
let exact = 0, wrong = 0; for (let t = 0; t < 200; t++) { const dueDay = new Date(2026, 2, 1 + t); let st: ReminderState = { due: null, stage: 0 }; const kinds: string[] = []; for (let k = -40; k <= 40; k++) { const today = new Date(dueDay.getFullYear(), dueDay.getMonth(), dueDay.getDate() + k); const dec = D(dueDay, st, today); if (dec.send) kinds.push(dec.send); st = dec.state; } exact++; if (kinds.join() !== "soon,due,overdue") wrong++; }
ok("a job that runs every day gives exactly one 'soon', then one 'due', then one 'overdue' for each due date (200 different due dates), in that order and never repeated", wrong === 0 && exact === 200, wrong);
console.log(`\nInspection reminder logic: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
