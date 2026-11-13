"use client";

import { useEffect } from "react";

// Registers the service worker on the client. Wrapped in its own component (rather than
// inline in the layout) so this stays a small, isolated client boundary rather than forcing
// the whole root layout to be a client component.
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Registering in development just adds noise while iterating (and the worker can hold
    // onto old cached files across hot reloads) — only register in production.
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
