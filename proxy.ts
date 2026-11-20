import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { safeNextPath } from "@/lib/safeRedirect";
import { SESSION_HINT_COOKIE, SESSION_HINT_MAX_AGE_SECONDS } from "@/lib/sessionHint";

// Route protection here is the first layer, not the only one — CVE-2025-29927 showed that
// middleware-only session checks in Next.js can be bypassed by spoofing a header. Every
// dashboard and portal page also calls getSession() itself and redirects if there's no session,
// so a middleware bypass alone doesn't grant access to anything.
//
// A signed-out visitor goes to the login page. Someone whose session has EXPIRED goes to a page that says so, and
// both are told which page to come back to afterwards. The difference is the "was signed in" marker (see
// lib/sessionHint.ts), which is refreshed here every time a valid session uses a protected page.
export async function proxy(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  const path = req.nextUrl.pathname;
  const protectedArea = path.startsWith("/dashboard") || path === "/portal" || path.startsWith("/portal/");
  if (!protectedArea) return NextResponse.next();

  if (session) {
    const res = NextResponse.next();
    res.cookies.set(SESSION_HINT_COOKIE, "1", {
      path: "/",
      maxAge: SESSION_HINT_MAX_AGE_SECONDS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false, // the browser clears it on sign-out; it holds no secret
    });
    return res;
  }

  const wasSignedIn = req.cookies.get(SESSION_HINT_COOKIE)?.value === "1";
  const target = new URL(wasSignedIn ? "/session-expired" : "/login", req.url);
  const next = safeNextPath(path + req.nextUrl.search);
  if (next) target.searchParams.set("next", next);
  const res = NextResponse.redirect(target);
  // said once: after this, coming back signed out is just a normal visit to the login page
  if (wasSignedIn) res.cookies.set(SESSION_HINT_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export const config = {
  matcher: ["/dashboard/:path*", "/portal/:path*"],
};
