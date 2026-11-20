// Pure helpers for removing stored files: which web addresses are really ours to delete.
// Only files in Vercel Blob storage are ever deleted: anything else (an outside link, a data: address, junk) is ignored, never passed on.
export function onlyBlobUrls(urls: Iterable<unknown>): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    if (typeof u !== "string" || u.length > 2048) continue;
    try {
      const p = new URL(u);
      if (p.protocol === "https:" && p.hostname.endsWith(".blob.vercel-storage.com")) out.add(p.toString());
    } catch { /* not an address */ }
  }
  return [...out];
}
export function chunk<T>(xs: T[], n: number): T[][] {
  const size = Math.max(1, Math.floor(n) || 1);
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += size) out.push(xs.slice(i, i + size));
  return out;
}
