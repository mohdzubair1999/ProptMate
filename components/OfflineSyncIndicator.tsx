"use client";

import { useEffect, useState } from "react";
import { discardRejectedWrites, getQueueCount, getRejectedWriteCount, processQueue, retryRejectedWrites, subscribeToQueueChanges } from "@/lib/offlineQueue";
import { discardRejectedPhotos, getPhotoQueueCount, getRejectedPhotoCount, processPhotoQueue, retryRejectedPhotos, subscribeToPhotoQueueChanges } from "@/lib/offlinePhotoQueue";

export default function OfflineSyncIndicator() {
  const [count, setCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [rejectedWrites, setRejectedWrites] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = async () => {
    try {
      const [writes, photos, refused, refusedWrites] = await Promise.all([getQueueCount(), getPhotoQueueCount(), getRejectedPhotoCount(), getRejectedWriteCount()]);
      setCount(writes + photos);
      setRejectedCount(refused);
      setRejectedWrites(refusedWrites);
    } catch {
      // IndexedDB genuinely unavailable (very old browser, or private browsing in some
      // browsers) — fail quietly rather than show a broken indicator for something this
      // minor. Offline queueing just won't apply for that person; their saves still work
      // normally as long as they actually have a connection.
    }
  };

  const syncBoth = () => Promise.all([processQueue(), processPhotoQueue()]);

  useEffect(() => {
    refresh();

    // The queue persists in IndexedDB across sessions — if someone queued changes, closed
    // the tab without reconnecting, and reopens the app later while already online, the
    // 'online' event never fires again (there's no transition to trigger it). Without this,
    // that persisted queue would just sit there until they happened to toggle connectivity
    // or clicked "Sync now" manually.
    if (navigator.onLine) syncBoth();

    const unsubscribeWrites = subscribeToQueueChanges(refresh);
    const unsubscribePhotos = subscribeToPhotoQueueChanges(refresh);

    // Also try syncing proactively whenever the tab regains focus — covers the case where
    // connectivity returned while the tab was backgrounded, since some browsers throttle or
    // skip the 'online' event for inactive tabs.
    const handleFocus = () => {
      if (navigator.onLine) syncBoth();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      unsubscribeWrites();
      unsubscribePhotos();
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  if (count === 0 && rejectedCount === 0 && rejectedWrites === 0) return null;

  const handleSyncNow = async () => {
    if (!navigator.onLine) return;
    setSyncing(true);
    await syncBoth();
    setSyncing(false);
  };

  return (
    <div className="fixed bottom-20 left-4 md:bottom-4 md:right-4 md:left-auto z-40 flex flex-col items-start md:items-end gap-2 text-sm">
      {count > 0 && (
        <div className="bg-ink text-white rounded-full px-4 py-2 shadow-lg flex items-center gap-2" data-testid="pending-sync">
          <span className="w-2 h-2 rounded-full bg-signal animate-pulse" />
          {count} change{count === 1 ? "" : "s"} pending sync
          <button onClick={handleSyncNow} disabled={syncing} className="underline hover:no-underline disabled:opacity-50 ml-1">
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      )}
      {rejectedWrites > 0 && (
        <div role="alert" className="bg-amber-50 text-amber-900 border border-amber-300 rounded-2xl px-4 py-2 shadow-lg max-w-xs" data-testid="rejected-writes">
          {rejectedWrites === 1 ? "1 change" : `${rejectedWrites} changes`} could not be saved: the server kept refusing {rejectedWrites === 1 ? "it" : "them"}. {rejectedWrites === 1 ? "It is" : "They are"} still saved on this device. If you were signed out, sign in and press Try again.
          <span className="block mt-1">
            <button onClick={() => retryRejectedWrites().then(async () => { if (navigator.onLine) await syncBoth(); })} className="underline hover:no-underline mr-3">
              Try again
            </button>
            <button
              onClick={() => {
                if (window.confirm(`Discard ${rejectedWrites === 1 ? "this unsaved change" : `these ${rejectedWrites} unsaved changes`}? This cannot be undone.`)) discardRejectedWrites();
              }}
              className="underline hover:no-underline"
            >
              Discard
            </button>
          </span>
        </div>
      )}
      {rejectedCount > 0 && (
        <div role="alert" className="bg-amber-50 text-amber-900 border border-amber-300 rounded-2xl px-4 py-2 shadow-lg max-w-xs" data-testid="rejected-photos">
          {rejectedCount === 1 ? "1 photo" : `${rejectedCount} photos`} could not be uploaded: the server did not accept {rejectedCount === 1 ? "it" : "them"}. {rejectedCount === 1 ? "It is" : "They are"} still saved on this device.
          <span className="block mt-1">
            <button onClick={() => retryRejectedPhotos().then(async () => { if (navigator.onLine) await syncBoth(); })} className="underline hover:no-underline mr-3">
              Try again
            </button>
            <button onClick={() => discardRejectedPhotos()} className="underline hover:no-underline">
              Discard
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
