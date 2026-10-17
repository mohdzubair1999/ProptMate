import { prisma } from "@/lib/prisma";

export type RateLimitResult = { allowed: boolean; retryAfterSeconds?: number };

// Checks and increments a fixed-window counter for the given key, atomically (a single
// upsert, so two concurrent requests can't both read "0" and both be allowed through past
// the actual limit). "Fixed window" means a request right at the boundary between two
// windows can, in principle, get roughly double the intended rate in a short burst - a known,
// accepted trade-off for the simplicity this gets in return, appropriate for stopping basic
// spam/abuse rather than being a precise, high-security throttle.
export async function checkRateLimit(key: string, maxRequests: number, windowMinutes: number): Promise<RateLimitResult> {
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const entry = await prisma.rateLimitEntry.upsert({
    where: { key_windowStart: { key, windowStart } },
    create: { key, windowStart, count: 1 },
    update: { count: { increment: 1 } },
  });

  // Opportunistic cleanup, not a scheduled job - roughly 1 in 200 calls also clears out
  // entries old enough that no live window could still reference them, so this table
  // doesn't grow unbounded without needing a separate cron job set up just for this.
  if (Math.random() < 0.005) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    prisma.rateLimitEntry.deleteMany({ where: { windowStart: { lt: cutoff } } }).catch(() => {
      // Best-effort - a failed cleanup pass just means it's retried next time; never worth
      // failing the actual request over.
    });
  }

  if (entry.count > maxRequests) {
    const windowEndsAt = windowStart.getTime() + windowMs;
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - Date.now()) / 1000)) };
  }

  return { allowed: true };
}

// Best-effort client IP extraction from Vercel's forwarded-for header - the same approach
// already used elsewhere in this app (see lib/actions/acknowledgements.ts's IP capture for
// e-signatures). x-forwarded-for can list multiple IPs (client, then any proxies in
// between) when a request passes through more than one hop, so only the first is taken -
// that's the original client, not whichever proxy touched the request last.
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}
