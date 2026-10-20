"use client";

import React, { useState } from "react";

// The 🔗 Share button and its panel. Turning sharing on saves the plan first (so the link has something to show),
// then creates the link. Anyone holding it sees a read-only copy and can download it as a PDF; turning it off kills
// the link for good.
export default function PlanSharePanel({
  shareToken,
  busy,
  message,
  onCreate,
  onDisable,
}: {
  shareToken: string | null;
  busy: boolean;
  message: string;
  onCreate: () => void;
  onDisable: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = shareToken && typeof window !== "undefined" ? `${window.location.origin}/plan/${shareToken}` : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the link is in a box the person can select and copy by hand */
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Share a read-only copy of this plan by link"
        data-testid="share-button"
        className={`text-sm rounded-full px-3 py-1.5 transition-colors border ${shareToken ? "text-signal border-signal bg-signal/10" : "text-ink border-line hover:border-signal"}`}
      >
        🔗 Share {shareToken ? "on" : ""}
      </button>
      {open && (
        <div className="w-full rounded-xl border border-line bg-white/60 px-3 py-3 space-y-2" data-testid="share-panel">
          {!shareToken ? (
            <>
              <p className="text-sm text-ink">Anyone with the link can view a read-only copy of this floor plan and download it as a PDF. You can turn it off at any time.</p>
              <button type="button" disabled={busy} onClick={onCreate} data-testid="share-create" className="text-sm rounded-full px-4 py-1.5 bg-signal text-white font-medium disabled:opacity-60">
                {busy ? "Saving and creating the link…" : "Save and create share link"}
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} data-testid="share-url" style={{ fontSize: 16 }} className="flex-1 min-w-[12rem] rounded-lg border border-line px-2 py-1.5 text-ink" />
                <button type="button" onClick={copy} data-testid="share-copy" className="text-sm rounded-full px-3 py-1.5 border border-line text-ink hover:border-signal">
                  {copied ? "Copied ✓" : "Copy link"}
                </button>
                <button type="button" disabled={busy} onClick={onDisable} data-testid="share-off" className="text-sm rounded-full px-3 py-1.5 border border-line text-red-600 hover:border-red-400 disabled:opacity-60">
                  Turn off sharing
                </button>
              </div>
              <p className="text-xs text-slate">The link shows the version you last saved - save again to update what people see. Turning sharing off stops the link working for good.</p>
            </>
          )}
          {message && <p role="alert" className="text-sm text-red-600">{message}</p>}
        </div>
      )}
    </>
  );
}
