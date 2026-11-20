"use client";

import { useState } from "react";
import type { LabelSuggestion } from "@/lib/readingAssess";
import { reportAiOutcome } from "@/lib/aiOutcome";

type Reply = { kind: "label"; suggestion: LabelSuggestion; photosUsed: number };

// "Read the label" for an appliance's rating-plate photo. It suggests the make and model for the Make box, which the person then
// checks and saves with the item's own Save button; nothing is stored by this. When the plate is not clear it offers nothing.
export default function LabelReader({ itemId, onUse }: { itemId: string; onUse: (make: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [used, setUsed] = useState(false);

  const run = async () => {
    setBusy(true);
    setError(null);
    setReply(null);
    setUsed(false);
    try {
      const res = await fetch("/api/ai/read-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "label", itemId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(typeof data?.error === "string" ? data.error : "The reading didn't work - please try again");
      else {
        setReply(data as Reply);
        const sg = (data as Reply).suggestion;
        reportAiOutcome("label_reading", sg.make ? "shown_offered" : "shown_declined", sg.confidence);
      }
    } catch {
      setError("Couldn't reach the AI - check your connection and try again");
    } finally {
      setBusy(false);
    }
  };

  const s = reply?.suggestion;
  return (
    <div className="mt-1" data-testid="label-reader">
      <button type="button" onClick={run} disabled={busy} className="text-xs px-3 py-1 rounded-full border border-line text-ink hover:border-signal transition-colors disabled:opacity-50">
        {busy ? "Reading…" : "👁 Read the label"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 mt-1">
          {error}
        </p>
      )}
      {s && (
        <div className="mt-1 rounded-lg border border-line bg-paper p-2 text-xs max-w-sm" data-testid="label-result">
          {s.make ? (
            <>
              <p>
                Make and model: <span className="font-semibold font-mono" data-testid="label-make">{s.make}</span>
              </p>
              {s.checkCarefully && (
                <p className="mt-0.5 text-amber-900" data-testid="label-check">
                  {s.reason ?? "Check this carefully against the plate."}
                </p>
              )}
              {s.serial && <p className="mt-0.5 text-slate">Serial (for reference): <span className="font-mono">{s.serial}</span></p>}
              {(s.year || s.energyRating) && (
                <p className="mt-0.5 text-slate">
                  {s.year ? `Made ${s.year}` : ""}
                  {s.year && s.energyRating ? " · " : ""}
                  {s.energyRating ? `Energy class ${s.energyRating}` : ""}
                </p>
              )}
              <button type="button" data-testid="label-use" disabled={used} onClick={() => { reportAiOutcome("label_reading", "used", s.confidence); onUse(s.make as string); setUsed(true); }} className="mt-1.5 px-3 py-1 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50">
                {used ? "Placed in the Make box ✓" : "Use as the Make"}
              </button>
              {used && <p className="mt-1 text-slate" data-testid="label-saved-hint">Check it, then press Save on this item.</p>}
            </>
          ) : (
            <p data-testid="label-none">{s.reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
