import { recordAiUsage } from "@/lib/aiUsage";
import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

// One place to stop a route being used without limit (written for the AI routes, now also used by the upload routes). Every AI call costs real money, and anyone can sign up, so a
// route with no limit is an open invoice. Client (tenant/landlord) accounts get a third of the allowance, because they
// have no reason to run batches of analyses.
type Who = { user?: { id?: string | null; role?: string | null; companyId?: string | null; [k: string]: unknown } | null } | null | undefined;

export async function aiRateLimit(
  session: Who,
  route: string,
  // clientShare: the fraction of the allowance client (tenant/landlord) accounts get; 1/3 by default, 1 for things like photo uploads they genuinely do in bulk
  opts: { max: number; windowMin: number; cost?: number; companyDaily?: number; clientShare?: number; usage?: string }
): Promise<NextResponse | null> {
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const max = session?.user?.role === "CLIENT" ? Math.max(1, Math.floor(opts.max * (opts.clientShare ?? 1 / 3) + 1e-9)) : opts.max;
  try {
    const checks = [{ key: `ai:${route}:${userId}`, max, win: opts.windowMin }];
    // an overall daily ceiling for the whole company, so one account cannot hide behind many users
    if (opts.companyDaily && session?.user?.companyId) checks.push({ key: `ai-day:${route}:${session.user.companyId}`, max: opts.companyDaily, win: 1440 });
    for (const c of checks) {
      const r = await checkRateLimit(c.key, c.max, c.win, opts.cost ?? 1);
      if (!r.allowed) {
        const wait = r.retryAfterSeconds ?? 60;
        // the company's DAILY ceiling is not "a lot of requests in a short time": say what it is, and that a cheaper option may still work
        const daily = c.win >= 1440;
        return NextResponse.json(
          { error: daily ? "Your company has used today's allowance for this feature. It starts again within 24 hours; the Quick option may still be available." : `That's a lot of requests in a short time - please wait ${wait > 90 ? `${Math.ceil(wait / 60)} minutes` : `${wait} seconds`} and try again.` },
          { status: 429, headers: { "Retry-After": String(wait) } }
        );
      }
    }
    // the request was allowed: count it, but only when the caller names the feature (the upload routes use this limiter too and are not AI, and a
    // request that passes through several limits is counted once, on the one call that names it)
    if (opts.usage && session?.user?.companyId) await recordAiUsage(session.user.companyId, opts.usage, opts.cost ?? 1);
  } catch (err) {
    // a problem with the counter must not take the feature down; it is logged so it gets noticed
    console.error("AI rate limit check failed, allowing the request:", err);
  }
  return null;
}

export const userRateLimit = aiRateLimit;
