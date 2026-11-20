// The service worker (public/sw.js) keeps a copy of every inspection page and photo you open, so a page still opens when there is no
// signal. Those copies include property addresses, tenants' details and photos, and they used to stay in the browser after someone
// signed out, readable (offline) by whoever used the device next. They are now removed whenever a person signs out, or their account is
// deleted or its password reset. The icons cache holds nothing private and is kept.

// must be exactly the name public/sw.js uses (a test checks they match)
export const INSPECTION_PAGE_CACHE = "proptmate-inspection-pages-v1";

// true if a cache was removed; false if there was none, or this browser has no Cache Storage. It never throws: signing out must not fail
// because of this.
export async function clearCachedPages(): Promise<boolean> {
  try {
    if (typeof caches === "undefined") return false;
    return await caches.delete(INSPECTION_PAGE_CACHE);
  } catch {
    return false;
  }
}
