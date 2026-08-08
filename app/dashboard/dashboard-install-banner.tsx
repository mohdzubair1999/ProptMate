"use client";

import { useEffect, useState } from "react";
import InstallAppButton from "@/components/InstallAppButton";
import { isInstalled, subscribeToInstallPrompt } from "@/lib/installPrompt";

const DISMISS_KEY = "proptmate-install-banner-dismissed";

export default function DashboardInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const alreadyDismissed = localStorage.getItem(DISMISS_KEY) === "1";
    if (isInstalled() || alreadyDismissed) return;

    // Only show this banner where there's actually a real, working button to offer — a
    // banner with no functional action next to it (which is what happens on Safari, since
    // it has no install-prompt event at all) would just look broken. Safari users still get
    // clear instructions from the Settings page card instead. Uses the same shared capture
    // as the button itself, so there's no risk of the event being consumed by one listener
    // and unavailable to the other.
    const unsubscribe = subscribeToInstallPrompt((event) => {
      if (event) setShow(true);
    });
    return unsubscribe;
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="bg-white border border-line rounded-xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
      <div>
        <p className="text-sm font-medium text-ink">Get ProptMate on your device</p>
        <p className="text-xs text-slate mt-0.5">Faster access, works like a real app — no browser tabs.</p>
      </div>
      <div className="flex items-center gap-3">
        <InstallAppButton />
        <button onClick={handleDismiss} className="text-xs text-slate hover:text-ink">
          Not now
        </button>
      </div>
    </div>
  );
}
