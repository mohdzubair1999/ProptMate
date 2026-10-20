import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

// One place to stop an AI route being used without limit. Every AI call costs real money, and anyone can sign up, so a
// route with no limit is an open invoice. Client (tenant/landlord) accounts get a third of the allowance, because they
// have no reason to run batches of analyses.
type Who = { user?: { id?: string | null; role?: string | null; companyId?: string | null; [k: string]: unknown } | null } | null | undefined;

export async function aiRateLimit(
  session: Who,
  route: string,
  opts: { max: number; windowMin: number; cost?: number; companyDaily?: number }
): Promise<NextResponse | null> {
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const max = session?.user?.role === "CLIENT" ? Math.max(1, Math.floor(opts.max / 3)) : opts.max;
  try {
    const checks = [{ key: `ai:${route}:${userId}`, max, win: opts.windowMin }];
    // an overall daily ceiling for the whole company, so one account cannot hide behind many users
    if (opts.companyDaily && session?.user?.companyId) checks.push({ key: `ai-day:${route}:${session.user.companyId}`, max: opts.companyDaily, win: 1440 });
    for (const c of checks) {
      const r = await checkRateLimit(c.key, c.max, c.win, opts.cost ?? 1);
      if (!r.allowed) {
        const wait = r.retryAfterSeconds ?? 60;
        return NextResponse.json(
          { error: `That's a lot of requests in a short time - please wait ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`} and try again.` },
          { status: 429, headers: { "Retry-After": String(wait) } }
        );
      }
    }
  } catch (err) {
    // a problem with the counter must not take the feature down; it is logged so it gets noticed
    console.error("AI rate limit check failed, allowing the request:", err);
  }
  return null;
}
