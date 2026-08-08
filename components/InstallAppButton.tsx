"use client";

import { useEffect, useState } from "react";
import { getInstallPrompt, isInstalled, subscribeToInstallPrompt } from "@/lib/installPrompt";

// Uses the browser's actual native install prompt where it's supported (Chrome/Edge on
// Android and macOS) — a real one-tap install, not a link to instructions. Safari doesn't
// support triggering this programmatically at all (no beforeinstallprompt event exists
// there), so on Safari we show the real, correct manual steps instead — this isn't a
// downgrade, it's the only way that browser allows.
export default function InstallAppButton({ variant = "button" }: { variant?: "button" | "card" }) {
  const [installEvent, setInstallEvent] = useState<any>(null);
  const [installed, setInstalledState] = useState(false);
  const [platform, setPlatform] = useState<"safari-mac" | "safari-ios" | "other">("other");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setInstalledState(isInstalled());
    setInstallEvent(getInstallPrompt());

    const unsubscribe = subscribeToInstallPrompt((event) => {
      setInstallEvent(event);
      if (!event) setInstalledState(isInstalled());
    });

    const ua = navigator.userAgent;
    const isSafari = /Safari/.test(ua) && !/Chrome|CriOS|EdgiOS/.test(ua);
    const isIOS = /iPhone|iPad|iPod/.test(ua);
    if (isSafari && isIOS) setPlatform("safari-ios");
    else if (isSafari) setPlatform("safari-mac");

    setChecking(false);

    return unsubscribe;
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    // The 'appinstalled' event (handled in the shared module) updates installed state and
    // clears the captured event for everyone subscribed — no need to duplicate that here.
  };

  // Nothing is knowable about install support until this runs client-side — showing the
  // "not available" fallback here first and correcting it a moment later would flash
  // incorrect information even in browsers that DO support installing. Show nothing at all
  // until the real check has actually happened.
  if (checking) return null;

  if (installed) {
    return variant === "card" ? (
      <div className="bg-white border border-line rounded-xl p-6">
        <h2 className="font-display font-600 text-lg text-ink">Download App</h2>
        <p className="text-sm text-verified mt-1">✓ Already installed on this device.</p>
      </div>
    ) : null;
  }

  // Real one-tap install available (Android Chrome, macOS Chrome/Edge/Brave)
  if (installEvent) {
    if (variant === "card") {
      return (
        <div className="bg-white border border-line rounded-xl p-6">
          <h2 className="font-display font-600 text-lg text-ink">Download App</h2>
          <p className="text-sm text-slate mt-1">Install ProptMate for faster access, right from your home screen or dock.</p>
          <button onClick={handleInstall} className="mt-3 bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            Download App
          </button>
        </div>
      );
    }
    return (
      <button onClick={handleInstall} className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
        Download App
      </button>
    );
  }

  // Safari doesn't support the native install prompt at all, and now that there's a real
  // native download for Mac (see the separate "Download for Mac" card), showing manual
  // "Add to Dock" instructions here is redundant rather than helpful — just show nothing.
  if (platform === "safari-mac" || platform === "safari-ios") {
    return null;
  }

  // Neither a native prompt nor Safari applies here (e.g. desktop Firefox, which doesn't
  // support PWA installation at all) — say so plainly in the Settings card rather than
  // leaving an unexplained gap in the grid. The inline dashboard banner just stays hidden
  // here, since a browser-switch suggestion doesn't read well as a banner.
  if (variant === "card") {
    return (
      <div className="bg-white border border-line rounded-xl p-6">
        <h2 className="font-display font-600 text-lg text-ink">Download App</h2>
        <p className="text-sm text-slate mt-1">Not available in this browser — try Chrome or Edge.</p>
      </div>
    );
  }

  return null;
}
