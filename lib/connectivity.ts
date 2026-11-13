// Confirms the server is genuinely reachable, not just that some network interface is up.
// navigator.onLine is checked first purely as a fast, free short-circuit - it can say
// "offline" reliably (no interface at all), but saying "online" doesn't mean much on its
// own (e.g. connected to wifi with no real internet access still reports true), so a real
// request is still needed to confirm actual reachability. Shared between offlineQueue.ts
// (text mutations) and offlinePhotoQueue.ts (photos), rather than duplicated in both.
export async function isGenuinelyOnline(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch("/api/health", { method: "GET", cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
