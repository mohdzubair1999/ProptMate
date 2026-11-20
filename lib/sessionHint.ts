// A small marker that says "this browser was signed in", so the site can tell an EXPIRED session from a person who
// was never signed in (or who signed out on purpose). Without it both look identical: no valid session.
//
// It holds no secret and grants no access: the value is just "1". It is set while someone is using the signed-in
// areas, lasts 30 days (longer than a session's 7), and is removed when they sign out. The browser deletes the real
// session cookie when it expires, which is exactly why a separate marker is needed.

import { clearCachedPages } from "@/lib/offlineCache";

export const SESSION_HINT_COOKIE = "pm_session_hint";
export const SESSION_HINT_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Browser side: called when someone signs out on purpose (or their account is deleted or password reset).
// It also removes the offline copies of inspection pages and photos kept for this browser, so the next person to use a shared device
// cannot open the previous person's pages by going offline.
export function clearSessionHint(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${SESSION_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  void clearCachedPages();
}
