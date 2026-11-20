"use client";

import { useState } from "react";
import { reportAiMiss } from "@/lib/actions/aiFeedback";
import { MISS_KINDS, MISS_KIND_LABELS, MISS_NOTE_MAX, type MissKind } from "@/lib/aiFeedback";

// Under an AI result: "The AI missed something?" The note is saved for the team to review, so the instructions can be tuned against real misses.
export default function AiMissButton({ inspectionId, mode }: { inspectionId?: string; mode: "quick" | "detailed" }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<MissKind>("small_mark");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  if (sent) return <p className="text-xs text-verified mt-1" data-testid="miss-sent">Thanks, noted. This helps improve the analysis.</p>;
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="text-xs text-slate underline hover:text-ink mt-1" data-testid="miss-open">The AI missed something?</button>;
  async function send() {
    setBusy(true); setError("");
    try {
      const r = await reportAiMiss({ inspectionId, kind, mode, note });
      if ("error" in r) setError(r.error); else setSent(true);
    } catch { setError("Couldn't send that. Please try again"); }
    setBusy(false);
  }
  return (
    <div className="mt-2 border border-line rounded-lg p-2 space-y-2" data-testid="miss-form">
      <select value={kind} onChange={(e) => setKind(e.target.value as MissKind)} className="text-xs border border-line rounded px-2 py-1 w-full" aria-label="What kind of thing was missed">
        {MISS_KINDS.map((k) => <option key={k} value={k}>{MISS_KIND_LABELS[k]}</option>)}
      </select>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={MISS_NOTE_MAX} rows={3} placeholder="What did it miss, and where? e.g. scuff on the left of the door frame" className="text-xs border border-line rounded px-2 py-1 w-full" />
      {error && <p className="text-xs text-red-700" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={busy} className="text-xs px-2.5 py-1 rounded-full bg-ink text-white hover:bg-signal disabled:opacity-50">{busy ? "Sending…" : "Send"}</button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate underline">Cancel</button>
      </div>
    </div>
  );
}
