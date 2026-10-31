"use client";

import { useState } from "react";
import { expireOlderShareLinks } from "@/lib/actions/floorplan";

// A prompt for Admins and Managers on the Floor Plans page: some share links were made before links could expire, so they never do, and
// anyone who has one can still open that plan. One button gives all of them an expiry, counting from today.
export default function ExpireOldLinks({ count }: { count: number }) {
  const [days, setDays] = useState("90");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ changed: number; expiresAt: string } | null>(null);

  const apply = async () => {
    setBusy(true);
    setError(null);
    try {
      setDone(await expireOlderShareLinks(Number(days)));
    } catch (err: any) {
      setError(err?.message || "Couldn't change them - please try again");
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="mt-6 rounded-xl border border-line bg-white p-4 text-sm text-ink" data-testid="expire-done" role="status">
        {done.changed === 0 ? "Those links already have an expiry." : `${done.changed} share link${done.changed === 1 ? " now expires" : "s now expire"} on ${new Date(done.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}.`} You can change any one of them from its floor plan&apos;s Share panel.
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4" data-testid="expire-old-links">
      <p className="text-sm font-semibold text-ink">{count} shared link{count === 1 ? "" : "s"} never expire{count === 1 ? "s" : ""}</p>
      <p className="text-xs text-slate mt-1">These were made before links could expire, so anyone who has one can still open that floor plan. You can make them all expire, counting from today.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="How long from today" data-testid="expire-days" className="rounded-lg border border-line px-2 py-1 text-sm bg-white">
          <option value="90">90 days (recommended)</option>
          <option value="30">30 days</option>
          <option value="365">1 year</option>
        </select>
        <button type="button" onClick={apply} disabled={busy} data-testid="expire-apply" className="text-sm rounded-full px-4 py-1.5 bg-ink text-white hover:bg-signal disabled:opacity-50">{busy ? "Setting…" : "Make them expire"}</button>
      </div>
      {error && <p role="alert" className="text-xs text-red-700 mt-2" data-testid="expire-error">{error}</p>}
    </div>
  );
}
