import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse } from "next/server";
import { authLimitFor } from "@/lib/authLimits";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isIpBlocked, logSecurityEvent } from "@/lib/security";

const handlers = toNextJsHandler(auth);
export const GET = handlers.GET;

// Sign-in, sign-up, password reset and two-factor requests are counted per address (in the database, so it holds across servers).
// If the counter itself is unavailable the request goes ahead: a database hiccup must never lock everyone out of signing in.
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const path = new URL(req.url).pathname;
  const limit = authLimitFor("POST", path);
  if (limit) {
    try {
      if (await isIpBlocked(ip)) return NextResponse.json({ message: "Too many requests" }, { status: 429 });
      const r = await checkRateLimit(`auth:${limit.name}:${ip}`, limit.max, limit.windowMinutes);
      if (!r.allowed) {
        await logSecurityEvent("rate_limit_exceeded", "low", ip, path, `Too many ${limit.name} attempts`);
        return NextResponse.json({ message: "Too many attempts. Please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(r.retryAfterSeconds ?? 60) } });
      }
    } catch (err) {
      console.error("Auth rate limit check failed (request allowed):", err);
    }
  }
  return handlers.POST(req);
}
