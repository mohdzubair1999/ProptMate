// Stage 1 service worker — deliberately conservative. Only caches genuinely static assets
// (icons, manifest) so the app installs cleanly and those load instantly. It does NOT cache
// dynamic pages or API responses yet — an inspection app showing STALE data because of an
// overly aggressive cache would be a real correctness problem, not just a minor bug. Proper
// offline form-filling (with a real sync queue) is Stage 2, built deliberately, not bolted
// on here as an afterthought.

const CACHE_NAME = "proptmate-static-v1";
const STATIC_ASSETS = ["/icon-192.png", "/icon-512.png", "/icon-512-maskable.png", "/manifest.webmanifest"];

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
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Only intervene for the specific static assets we deliberately cached above — everything
  // else (pages, API calls, uploads) goes straight to the network untouched.
  if (STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});
