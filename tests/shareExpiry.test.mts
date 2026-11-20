import { normaliseExpiryDays as N, expiryDateFor as E, isExpired as X, describeExpiry as DX, SHARE_EXPIRY_CHOICES, DEFAULT_SHARE_EXPIRY_DAYS } from "../lib/shareExpiry";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const uk = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", dateStyle: "short", timeStyle: "medium", hour12: false }).format(d);
ok("the offered lengths are 30 days, 90 days and a year, and the default is 90 days", JSON.stringify(SHARE_EXPIRY_CHOICES) === "[30,90,365]" && DEFAULT_SHARE_EXPIRY_DAYS === 90);
ok("nothing chosen means the default; null means never", N(undefined) === 90 && N(null) === null);
for (const d of [30, 90, 365]) ok(`${d} days is accepted`, N(d) === d);
for (const bad of [0, 1, 7, 29, 31, 60, 91, 364, 366, 3650, -30, 30.5, NaN, Infinity, "30", "90", "never", true, {}, [], [30]]) ok(`${JSON.stringify(bad)} is refused ('invalid'): nobody can set a link that lasts 10 years by sending a number`, N(bad) === "invalid");
ok("'never' (null) gives no date", E(null) === null);
// winter: UK = UTC
let d = E(30, new Date("2026-01-10T10:00:00Z"))!; ok("30 days from 10 Jan 2026 (winter) ends at 23:59:59 UK time on 9 Feb 2026", uk(d) === "09/02/2026, 23:59:59", uk(d));
d = E(90, new Date("2026-01-10T10:00:00Z"))!; ok("90 days from 10 Jan 2026 ends on 10 Apr 2026 at 23:59:59 UK time (across the clocks changing in March)", uk(d) === "10/04/2026, 23:59:59", uk(d));
d = E(365, new Date("2026-01-10T10:00:00Z"))!; ok("a year from 10 Jan 2026 ends on 10 Jan 2027", uk(d) === "10/01/2027, 23:59:59", uk(d));
d = E(30, new Date("2026-06-10T10:00:00Z"))!; ok("in summer (UK = UTC+1) it is still 23:59:59 UK time (22:59:59 UTC)", uk(d) === "10/07/2026, 23:59:59" && d.toISOString() === "2026-07-10T22:59:59.000Z", [uk(d), d.toISOString()]);
d = E(30, new Date("2026-03-20T10:00:00Z"))!; ok("from before the clocks go forward, to after: still the end of the UK day", uk(d) === "19/04/2026, 23:59:59", uk(d));
d = E(30, new Date("2026-10-10T10:00:00Z"))!; ok("from before the clocks go back, to after: still the end of the UK day", uk(d) === "09/11/2026, 23:59:59", uk(d));
d = E(30, new Date("2026-01-10T23:30:00Z"))!; ok("late on a winter evening UTC the UK date is the same day", uk(d) === "09/02/2026, 23:59:59", uk(d));
d = E(30, new Date("2026-06-10T23:30:00Z"))!; ok("at 00:30 UK time on 11 June (23:30 UTC on the 10th) the count starts from the UK date, 11 June", uk(d) === "11/07/2026, 23:59:59", uk(d));
d = E(30, new Date("2028-02-10T10:00:00Z"))!; ok("across a leap day (29 Feb 2028) the calendar is right", uk(d) === "11/03/2028, 23:59:59", uk(d));
d = E(365, new Date("2027-12-31T12:00:00Z"))!; ok("across a year end", uk(d) === "30/12/2028, 23:59:59" || uk(d) === "31/12/2028, 23:59:59", uk(d));
let bad = 0; for (let i = 0; i < 4000; i++) { const now = new Date(Date.UTC(2024 + (i % 6), (i * 7) % 12, 1 + (i * 13) % 28, (i * 5) % 24, (i * 11) % 60)); for (const days of [30, 90, 365] as const) { const e = E(days, now)!; const diff = (+e - +now) / 86_400_000; if (!(diff > days - 1 && diff < days + 1.01)) bad++; if (!/23:59:59$/.test(uk(e))) bad++; } }
ok("4,000 random start times over six years: the expiry is always between (days minus 1) and (days plus 1) days away, and always 23:59:59 UK time", bad === 0, bad);
const now = new Date("2026-05-01T12:00:00Z"); ok("no expiry is never expired; a past date is; a future date is not; the exact moment counts as expired", !X(null, now) && !X(undefined, now) && X("2026-04-30T00:00:00Z", now) && !X("2026-05-02T00:00:00Z", now) && X("2026-05-01T12:00:00Z", now));
ok("an invalid date is never treated as expired (so a corrupt value cannot lock people out)", !X("not a date", now) && !X(new Date("x"), now));
ok("describing: never", DX(null) === "Never expires" && DX(undefined) === "Never expires" && DX("garbage") === "Never expires");
ok("describing: a future date says the date and how long", DX("2026-07-10T22:59:59Z", now) === "Expires on 10 July 2026 (in 71 days)", DX("2026-07-10T22:59:59Z", now));
ok("describing: tomorrow, and the last day", DX("2026-05-02T10:00:00Z", now) === "Expires on 2 May 2026 (tomorrow at the latest)" && /Expires on/.test(DX("2026-05-01T20:00:00Z", now)), [DX("2026-05-02T10:00:00Z", now), DX("2026-05-01T20:00:00Z", now)]);
ok("describing: a past date says expired and when", DX("2026-04-01T22:59:59Z", now) === "Expired on 2 April 2026" || DX("2026-04-01T22:59:59Z", now) === "Expired on 1 April 2026", DX("2026-04-01T22:59:59Z", now));
console.log(`\nShare link expiry rules: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
