// The beforeinstallprompt event fires once per page load and must be captured immediately
// (calling preventDefault() synchronously) or the browser shows its own default UI instead.
// If both the dashboard banner and the settings button each registered their own listener,
// only whichever mounted first would actually receive the event — the other would render a
// button that does nothing when clicked. This module captures it exactly once, in one place,
// and lets any component subscribe to that single captured event.

type Listener = (event: any) => void;

let capturedEvent: any = null;
let installed = false;
const listeners = new Set<Listener>();

if (typeof window !== "undefined") {
  if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
    installed = true;
  }

  window.addEventListener("beforeinstallprompt", (e: any) => {
    e.preventDefault();
    capturedEvent = e;
    listeners.forEach((l) => l(capturedEvent));
  });

  window.addEventListener("appinstalled", () => {
    installed = true;
    capturedEvent = null;
    listeners.forEach((l) => l(null));
  });
}

export function getInstallPrompt() {
  return capturedEvent;
}

export function isInstalled() {
  return installed;
}

export function subscribeToInstallPrompt(listener: Listener) {
  listeners.add(listener);
  if (capturedEvent) listener(capturedEvent); // already captured before this subscriber mounted
  return () => {
    listeners.delete(listener);
  };
}
