import { createHash, timingSafeEqual } from "crypto";

// Compares two secrets in constant time, so how long the check takes never hints at how much of a guess was right.
// Both sides are hashed first, so different lengths are handled without leaking the length either.
export function safeEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

// True only for a request that carries the cron secret as "Authorization: Bearer <secret>". A missing secret setting means nobody gets in.
export function hasCronSecret(authHeader: string | null | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return safeEqual(authHeader ?? "", `Bearer ${secret}`);
}
