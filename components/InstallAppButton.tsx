"use client";

import { useEffect, useState } from "react";
import { getInstallPrompt, isInstalled, subscribeToInstallPrompt } from "@/lib/installPrompt";

// Uses the browser's actual native install prompt where it's supported (Chrome/Edge on
// Android and macOS) — a real one-tap install, not a link to instructions. Safari doesn't
// support triggering this programmatically at all (no beforeinstallprompt event exists
// there). Mac Safari falls back to nothing here since a real .dmg download exists instead;
// iOS Safari falls back to "Add to Home Screen" instructions, since that's genuinely the
// only install path available on iPhone/iPad — see the platform-specific handling below.
export default function InstallAppButton({ variant = "button", hideIosCard = false }: { variant?: "button" | "card"; hideIosCard?: boolean }) {
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

  // Mac Safari doesn't support the native install prompt, but there's now a real native
  // download for Mac (see the separate "Download for Mac" card) — showing manual "Add to
  // Dock" instructions here would be redundant rather than helpful.
  if (platform === "safari-mac") {
    return null;
  }

  // iOS/iPadOS is genuinely different: there's no real installable-file alternative the way
  // Mac has a .dmg, and no App Store listing without paying Apple's $99/year developer fee.
  // Safari's own "Add to Home Screen" is the only install path that exists on iOS, so unlike
  // Mac, removing this guidance would leave iPhone/iPad users with nothing at all.
  if (platform === "safari-ios") {
    if (hideIosCard) return null;
    if (variant === "card") {
      return (
        <div className="bg-white border border-line rounded-xl p-6">
          <h2 className="font-display font-600 text-lg text-ink">Download for iPhone/iPad</h2>
          <p className="text-sm text-slate mt-1">Tap the Share button, then scroll down and tap "Add to Home Screen."</p>
        </div>
      );
    }
    return null; // Skip the inline dashboard banner — the Share-menu instruction reads oddly as a quick-action button
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
