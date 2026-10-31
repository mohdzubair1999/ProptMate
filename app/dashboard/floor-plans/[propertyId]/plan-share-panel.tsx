"use client";

import React, { useState } from "react";
import { DEFAULT_SHARE_EXPIRY_DAYS, describeExpiry, isExpired } from "@/lib/shareExpiry";

// the lengths on offer, as the strings used in the drop-down ("never" = no expiry)
const CHOICES: { value: string; label: string }[] = [
  { value: "90", label: "90 days (recommended)" },
  { value: "30", label: "30 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "No expiry" },
];
const toDays = (v: string): number | null => (v === "never" ? null : Number(v));

// The 🔗 Share button and its panel. Turning sharing on saves the plan first (so the link has something to show),
// then creates the link. Anyone holding it sees a read-only copy and can download it as a PDF; turning it off kills
// the link for good.
export default function PlanSharePanel({
  shareToken,
  expiresAt,
  views,
  busy,
  message,
  onCreate,
  onChangeExpiry,
  onDisable,
}: {
  shareToken: string | null;
  expiresAt: string | null;
  views?: { count: number; last: string | null } | null;
  busy: boolean;
  message: string;
  onCreate: (days: number | null) => void;
  onChangeExpiry: (days: number | null) => void;
  onDisable: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState(String(DEFAULT_SHARE_EXPIRY_DAYS));
  const expired = !!shareToken && isExpired(expiresAt);
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
        🔗 Share {shareToken ? (expired ? "expired" : "on") : ""}
      </button>
      {open && (
        <div className="w-full rounded-xl border border-line bg-white/60 px-3 py-3 space-y-2" data-testid="share-panel">
          {!shareToken ? (
            <>
              <p className="text-sm text-ink">Anyone with the link can view a read-only copy of this floor plan and download it as a PDF. You can turn it off at any time.</p>
              <label className="block text-sm text-ink">
                How long should the link work?{" "}
                <select value={choice} onChange={(e) => setChoice(e.target.value)} data-testid="share-expiry-choice" className="ml-1 rounded-lg border border-line px-2 py-1 text-sm">
                  {CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={busy} onClick={() => onCreate(toDays(choice))} data-testid="share-create" className="text-sm rounded-full px-4 py-1.5 bg-signal text-white font-medium disabled:opacity-60">
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
              <p className={`text-sm ${expired ? "text-red-600 font-medium" : "text-ink"}`} data-testid="share-expiry">
                {describeExpiry(expiresAt)}
                {expired ? ". The link no longer works." : ""}
              </p>
              <p className="text-xs text-slate" data-testid="share-views">
                {!views || views.count === 0 ? "Not opened yet" : `Opened ${views.count} time${views.count === 1 ? "" : "s"}${views.last ? `, most recently on ${new Date(views.last).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" })}` : ""}`}
                <span className="block">Counts every time the page or its PDF is opened, including by you and by link previews.</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm text-ink">
                  {expired ? "Renew it for" : "Change to"}{" "}
                  <select value={choice} onChange={(e) => setChoice(e.target.value)} data-testid="share-expiry-choice" className="ml-1 rounded-lg border border-line px-2 py-1 text-sm">
                    {CHOICES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" disabled={busy} onClick={() => (expired ? onCreate(toDays(choice)) : onChangeExpiry(toDays(choice)))} data-testid="share-expiry-apply" className="text-sm rounded-full px-3 py-1.5 border border-line text-ink hover:border-signal disabled:opacity-60">
                  {expired ? "Renew link" : "Update"}
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
