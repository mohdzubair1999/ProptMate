// Where to send someone after they sign in again.
//
// The page they were on travels through the address as ?next=..., which anyone can edit or forge, so it is NEVER
// trusted as it arrives. A link like /login?next=https://evil.example must not send a freshly signed-in person to a
// look-alike site. Only a path inside the signed-in areas of this site (the dashboard or the client portal) passes.

const BASE = "https://same-origin.invalid"; // a made-up origin: anything that resolves away from it is not a local path
const AREAS = ["/dashboard", "/portal"] as const;
const MAX_LENGTH = 500;

const inArea = (pathname: string, area: string) => pathname === area || pathname.startsWith(area + "/");

// Returns a clean local path (with its query string) or null. Never returns anything that leaves this site.
export function safeNextPath(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw || raw.length > MAX_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null; // "//host" means "another site" to a browser
  if (/[\\\u0000-\u001f\u007f\u2028\u2029]/.test(raw)) return null; // backslashes and control characters are treated as slashes or line breaks by some browsers
  // An encoded slash, backslash or NUL never appears in a real ProptMate address, but some servers decode them into path separators
  if (/%(2f|5c|00)/i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  // url.pathname is already normalised, so /dashboard/../login (and its encoded forms) has become /login here
  if (!AREAS.some((a) => inArea(url.pathname, a))) return null;
  return url.pathname + url.search; // the #fragment is dropped on purpose
}

// The page to open after a successful sign-in: the one they were on if it is safe AND belongs to their kind of
// account (clients use the portal, staff use the dashboard), otherwise their normal home.
export function destinationAfterLogin(next: unknown, role: unknown): string {
  const area = role === "CLIENT" ? "/portal" : "/dashboard";
  const safe = safeNextPath(next);
  if (safe && inArea(safe.split("?")[0], area)) return safe;
  return area;
}
