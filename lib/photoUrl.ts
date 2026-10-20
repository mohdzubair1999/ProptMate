// Photo addresses the browser sends to the AI route.
//
// The server downloads whatever address it is given, so an unchecked address would let any signed-in account make
// the server fetch internal or third-party web addresses (a "server-side request forgery"). ProptMate photos only
// ever live in its own Vercel Blob storage, in two folders, so that is all that is accepted.

const STORAGE_HOST = /^[a-z0-9]{6,40}\.public\.blob\.vercel-storage\.com$/;
const PHOTO_FOLDERS = ["/inspection-photos/", "/field-photos/"];
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
export const PHOTO_FETCH_TIMEOUT_MS = 15_000;

export type PhotoUrlCheck = { ok: true; url: string } | { ok: false; reason: string };

export function validatePhotoUrl(input: unknown): PhotoUrlCheck {
  if (typeof input !== "string") return { ok: false, reason: "not text" };
  if (input.length === 0 || input.length > 800) return { ok: false, reason: "wrong length" };
  if (/[\s\u0000-\u001f\u007f\\]/.test(input)) return { ok: false, reason: "contains whitespace, control characters or a backslash" };
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    return { ok: false, reason: "not a web address" };
  }
  if (u.protocol !== "https:") return { ok: false, reason: "not https" };
  if (u.username || u.password) return { ok: false, reason: "contains a username or password" };
  if (u.port) return { ok: false, reason: "contains a port" };
  if (!STORAGE_HOST.test(u.hostname)) return { ok: false, reason: "not ProptMate photo storage" };
  if (u.search || u.hash || input.includes("?") || input.includes("#")) return { ok: false, reason: "has a query or fragment" };
  if (!PHOTO_FOLDERS.some((f) => u.pathname.startsWith(f))) return { ok: false, reason: "not in a photo folder" };
  if (/%(2e|2f|5c|00)/i.test(u.pathname) || u.pathname.includes("..") || u.pathname.includes("//")) return { ok: false, reason: "unsafe path" };
  return { ok: true, url: u.href };
}

// Downloads one photo with limits: a time limit, a size limit, no following of redirects, and it must really be an image.
export async function fetchPhotoBuffer(url: string, opts: { fetchImpl?: typeof fetch; timeoutMs?: number; maxBytes?: number } = {}): Promise<Buffer> {
  const f = opts.fetchImpl ?? fetch;
  const maxBytes = opts.maxBytes ?? MAX_PHOTO_BYTES;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? PHOTO_FETCH_TIMEOUT_MS);
  try {
    const res = await f(url, { signal: controller.signal, redirect: "manual" });
    if (res.status >= 300 && res.status < 400) throw new Error("Photo address redirected");
    if (!res.ok) throw new Error("Could not download photo");
    const type = (res.headers.get("content-type") || "").toLowerCase();
    if (type && !type.startsWith("image/") && !type.startsWith("application/octet-stream")) throw new Error("That is not an image");
    const declared = parseInt(res.headers.get("content-length") || "", 10);
    if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Photo is too large");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("Photo is too large");
    return buffer;
  } catch (err) {
    if ((err as any)?.name === "AbortError") throw new Error("Photo download took too long");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
