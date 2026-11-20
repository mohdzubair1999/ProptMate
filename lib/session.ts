import { headers } from "next/headers";
import { auth } from "./auth";

// Better Auth's auth.api.getSession() returns { session, user } as siblings — but our whole
// codebase was written against NextAuth's shape, where everything hangs off session.user.X.
// Reshaping it here once means every other file only needs its import/call syntax updated,
// not every individual session?.user?.role reference throughout the app.
export async function getSession() {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  return { user: result.user };
}
