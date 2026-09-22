import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

// Route protection here is the first layer, not the only one — CVE-2025-29927 showed that
// middleware-only session checks in Next.js can be bypassed by spoofing a header. Every
// dashboard page also calls getSession() itself and redirects if there's no session, so a
// middleware bypass alone doesn't grant access to anything.
export async function proxy(req: NextRequest) {
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session && req.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
