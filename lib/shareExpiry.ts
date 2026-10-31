// How long a shared floor plan link lasts. A link shows the layout of someone's home to anyone who holds it, so new links expire by
// default; the person can pick a different length, or "no expiry". Links created before this existed have no expiry and keep working.
// Pure rules (no database), so the dates are tested directly.

export const SHARE_EXPIRY_CHOICES = [30, 90, 365] as const;
export type ShareExpiryDays = (typeof SHARE_EXPIRY_CHOICES)[number];
export const DEFAULT_SHARE_EXPIRY_DAYS: ShareExpiryDays = 90;

// undefined = "use the default"; null = "never expires"; a number must be one of the offered lengths (anything else is refused)
export function normaliseExpiryDays(days: unknown): ShareExpiryDays | null | "invalid" {
  if (days === undefined) return DEFAULT_SHARE_EXPIRY_DAYS;
  if (days === null) return null;
  return typeof days === "number" && (SHARE_EXPIRY_CHOICES as readonly number[]).includes(days) ? (days as ShareExpiryDays) : "invalid";
}

// The moment a link created now would stop working: the end of the day, UK time, that many days ahead. (23:59:59 on that day, so "30 days"
// means the link works for the whole of the 30th day rather than dying part-way through it.)
export function expiryDateFor(days: ShareExpiryDays | null, now: Date = new Date()): Date | null {
  if (days === null) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  // the date it is in the UK now, moved forward by whole calendar days, then the end of that day in UK time
  const target = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + days));
  const y = target.getUTCFullYear(), m = target.getUTCMonth(), d = target.getUTCDate();
  const guess = new Date(Date.UTC(y, m, d, 23, 59, 59));
  // UK time is an hour ahead of UTC in summer: find the UTC moment whose UK clock reads 23:59:59 on that date
  const ukHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(guess));
  const offsetHours = (ukHour - 23 + 24) % 24; // 0 in winter, 1 in summer
  return new Date(guess.getTime() - offsetHours * 3600_000);
}

export function isExpired(expiresAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (expiresAt === null || expiresAt === undefined) return false;
  const t = +new Date(expiresAt);
  return Number.isFinite(t) && t <= +now;
}

const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
export function describeExpiry(expiresAt: Date | string | null | undefined, now: Date = new Date()): string {
  if (expiresAt === null || expiresAt === undefined) return "Never expires";
  const d = new Date(expiresAt);
  if (!Number.isFinite(+d)) return "Never expires";
  if (isExpired(d, now)) return `Expired on ${fmt(d)}`;
  const days = Math.max(1, Math.ceil((+d - +now) / 86_400_000));
  return `Expires on ${fmt(d)} (${days === 1 ? "tomorrow at the latest" : `in ${days} days`})`;
}
