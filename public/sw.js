// Stage 1 service worker — deliberately conservative. Only caches genuinely static assets
// (icons, manifest) so the app installs cleanly and those load instantly. It does NOT cache
// dynamic pages or API responses yet — an inspection app showing STALE data because of an
// overly aggressive cache would be a real correctness problem, not just a minor bug. Proper
// offline form-filling (with a real sync queue) is Stage 2, built deliberately, not bolted
// on here as an afterthought.

const CACHE_NAME = "proptmate-static-v1";
const STATIC_ASSETS = ["/icon-192.png", "/icon-512.png", "/icon-512-maskable.png", "/manifest.webmanifest"];
const INSPECTION_PAGE_CACHE = "proptmate-inspection-pages-v1";
// Every cache this service worker owns - the activate handler below preserves exactly these
// and deletes anything else, so a genuinely retired cache from a future version still gets
// cleaned up without needing to remember to update that logic separately every time a new
// cache is added here.
const CACHES_TO_KEEP = [CACHE_NAME, INSPECTION_PAGE_CACHE];

self.addEventListener("install", (event) => {
  // Deliberately not cache.addAll() — that call is all-or-nothing, so a single asset
  // failing to fetch (a typo'd path, a temporary network blip during install) would silently
  // abort the ENTIRE install and leave the service worker doing nothing at all. Caching each
  // asset independently means one bad entry doesn't take the others down with it.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((asset) =>
          cache.add(asset).catch((err) => console.warn(`Service worker: couldn't cache ${asset}`, err))
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => !CACHES_TO_KEEP.includes(name)).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

// Stage 2 — network-first caching for inspection pages specifically, so a reload while
// offline shows the last-fetched version of the page an inspector was actually working on,
// rather than the browser's own "no internet" error page. Deliberately network-first, not
// cache-first: the network is always tried before the cache, so a live connection always
// wins and the cache is only ever a last resort when there's genuinely no connectivity at
// all - the same "never prefer a stale cache over live data" caution the comment above
// already established, just extended to the one place offline access actually matters,
// rather than caching every route indiscriminately (settings, billing, etc, where a stale
// cache would be more confusing than useful and isn't what offline mode is actually for).
//
// Photo images are cached the same way, and deliberately regardless of origin - inspection
// photos live on Vercel Blob's own domain, not this app's, so a pathname-based match (like
// the inspection-page one below) would never catch them. Without this, an inspection page's
// own HTML would load fine from cache while offline, but every photo referenced inside it
// would show as a broken image instead - technically "the page loaded" while still leaving
// the person unable to see the one thing (photos) an inspection app is mostly about. Detected
// via the request's own destination rather than matching a specific storage hostname, so this
// stays correct even if the exact blob storage domain format ever changes.

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only intervene for the specific static assets we deliberately cached above — everything
  // else (pages, API calls, uploads) goes straight to the network untouched.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
    return;
  }

  const isInspectionPage = event.request.method === "GET" && /^\/dashboard\/inspections\/[^/]+/.test(url.pathname);
  const isImage = event.request.method === "GET" && event.request.destination === "image";

  if (isInspectionPage || isImage) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Only cache genuinely successful responses - caching an error page would mean
          // that error keeps being served offline instead of the last actually-good version.
          // Cross-origin images without CORS headers (Vercel Blob photo URLs, requested via
          // a plain <img> tag) come back as "opaque" responses, which always report ok as
          // false regardless of whether they actually loaded fine - opaque is accepted here
          // too, since the worst case (caching a genuinely broken opaque response) still just
          // shows as a broken image, no worse than never caching it at all, while correctly
          // caching the overwhelmingly common case of a real, successfully-loaded photo.
          if (response.ok || response.type === "opaque") {
            const responseClone = response.clone();
            caches.open(INSPECTION_PAGE_CACHE).then((cache) => cache.put(event.request, responseClone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
  }
});
