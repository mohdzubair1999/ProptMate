"use client";

import { useEffect, useState } from "react";
import { getQueueCount, processQueue, subscribeToQueueChanges } from "@/lib/offlineQueue";

export default function OfflineSyncIndicator() {
  const [count, setCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    try {
      setCount(await getQueueCount());
    } catch {
      // IndexedDB genuinely unavailable (very old browser, or private browsing in some
      // browsers) — fail quietly rather than show a broken indicator for something this
      // minor. Offline queueing just won't apply for that person; their saves still work
      // normally as long as they actually have a connection.
    }
  };

  useEffect(() => {
    refresh();

    // The queue persists in IndexedDB across sessions — if someone queued changes, closed
    // the tab without reconnecting, and reopens the app later while already online, the
    // 'online' event never fires again (there's no transition to trigger it). Without this,
    // that persisted queue would just sit there until they happened to toggle connectivity
    // or clicked "Sync now" manually.
    if (navigator.onLine) processQueue();

    const unsubscribe = subscribeToQueueChanges(refresh);

    // Also try syncing proactively whenever the tab regains focus — covers the case where
    // connectivity returned while the tab was backgrounded, since some browsers throttle or
    // skip the 'online' event for inactive tabs.
    const handleFocus = () => {
      if (navigator.onLine) processQueue();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  if (count === 0) return null;

  const handleSyncNow = async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    await processQueue();
    setSyncing(false);
  };

  return (
    <div className="fixed bottom-20 left-4 md:bottom-4 md:right-4 md:left-auto z-40 bg-ink text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2 text-sm">
      <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
      {count} change{count === 1 ? "" : "s"} pending sync
      <button onClick={handleSyncNow} disabled={syncing} className="underline hover:no-underline disabled:opacity-50 ml-1">
        {syncing ? "Syncing…" : "Sync now"}
      </button>
    </div>
  );
}
