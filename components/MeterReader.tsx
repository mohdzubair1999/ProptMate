"use client";

import { useState } from "react";
import { setReactControlledValue } from "@/lib/reactInputHelper";
import type { MeterSuggestion } from "@/lib/readingAssess";
import { reportAiOutcome } from "@/lib/aiOutcome";

type Reply = { kind: "meter"; suggestion: MeterSuggestion; target: { readingFieldId: string | null; serialFieldId: string | null } | null; photosUsed: number };
const TYPE: Record<string, string> = { electricity: "Electricity meter", gas: "Gas meter", water: "Water meter", unknown: "Meter" };

// "Read the meter from the photo" for a meter-readings section. It SUGGESTS the digits and shows them large, to be compared with the
// photo just above. Nothing is filled in until the person says the digits match, and a number already typed is never replaced
// without asking. If the photo is not clear enough, it says so and offers nothing: a wrong reading is worse than none.
export default function MeterReader({ inspectionId, photoFieldId }: { inspectionId: string; photoFieldId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setReply(null);
    setDone(new Set());
    setNote(null);
    try {
      const res = await fetch("/api/ai/read-photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "meter", inspectionId, photoFieldId }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(typeof data?.error === "string" ? data.error : "The reading didn't work - please try again");
      else {
        setReply(data as Reply);
        const sg = (data as Reply).suggestion;
        reportAiOutcome("meter_reading", sg.reading ? "shown_offered" : "shown_declined", sg.confidence);
      }
    } catch {
      setError("Couldn't reach the AI - check your connection and try again");
    } finally {
      setBusy(false);
    }
  };

  const place = (key: string, fieldId: string | null, value: string | null, what: string) => {
    const el = fieldId ? (document.getElementById(`field-${fieldId}`) as HTMLInputElement | HTMLTextAreaElement | null) : null;
    if (!el || !value) {
      setNote("Couldn't find that box on the page.");
      return;
    }
    const current = (el.value || "").trim();
    if (current && current !== value && !window.confirm(`The ${what} box already says "${current}". Replace it with "${value}"?`)) return;
    setReactControlledValue(el, value);
    reportAiOutcome("meter_reading", "used", reply?.suggestion.confidence);
    setDone((prev) => new Set(prev).add(key));
    setNote(null);
  };
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      reportAiOutcome("meter_reading", "copied", reply?.suggestion.confidence);
      setNote("Copied.");
    } catch {
      setNote("Couldn't copy here - type it in by hand.");
    }
  };

  const s = reply?.suggestion;
  const t = reply?.target;
  return (
    <div className="mb-2" data-testid="meter-reader">
      <button type="button" onClick={run} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border border-line text-ink hover:border-signal transition-colors disabled:opacity-50">
        {busy ? "Reading…" : "👁 Read the meter from the photo"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 mt-1">
          {error}
        </p>
      )}
      {s && (
        <div className="mt-2 rounded-lg border border-line bg-paper p-3 text-sm max-w-md" data-testid="meter-result">
          <p className="font-semibold text-ink">
            {TYPE[s.meterType]}
            {s.unit ? <span className="font-normal text-slate"> ({s.unit})</span> : null}
          </p>
          {s.reading ? (
            <>
              <p className="mt-1 text-xs text-slate">Check these digits against the photo above before using them:</p>
              <p className="mt-1 font-mono text-2xl tracking-widest text-ink" data-testid="meter-digits">
                {s.reading}
              </p>
              {s.redDigits && (
                <p className="mt-1 text-xs text-slate" data-testid="meter-red">
                  Digits on the red part (not included above): {s.redDigits}
                </p>
              )}
              {s.secondReading && (
                <p className="mt-1 text-xs text-amber-900" data-testid="meter-second">
                  This meter has a second register ({s.secondReading}). Record it yourself: only the first is offered.
                </p>
              )}
              <div className="mt-2 flex gap-2 flex-wrap">
                {t?.readingFieldId ? (
                  <button type="button" data-testid="meter-use" disabled={done.has("reading")} onClick={() => place("reading", t.readingFieldId, s.reading, "reading")} className="text-xs px-3 py-1 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50">
                    {done.has("reading") ? "Used ✓" : "The digits match the photo: use them"}
                  </button>
                ) : (
                  <span className="text-xs text-slate" data-testid="meter-nobox">
                    There's no matching box in this section to put it in.
                  </span>
                )}
                <button type="button" onClick={() => copy(s.reading as string)} className="text-xs px-3 py-1 rounded-full border border-line hover:border-signal transition-colors">
                  Copy digits
                </button>
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs text-ink" data-testid="meter-noreading">
              <p>{s.reason}</p>
              {s.partial && <p className="mt-1 text-slate">What could be seen: <span className="font-mono">{s.partial}</span></p>}
            </div>
          )}
          {s.serial && (
            <p className="mt-2 text-xs" data-testid="meter-serial">
              Serial: <span className="font-mono">{s.serial}</span>{" "}
              {t?.serialFieldId && (
                <button type="button" disabled={done.has("serial")} onClick={() => place("serial", t.serialFieldId, s.serial, "serial number")} className="ml-1 px-2 py-0.5 rounded-full border border-line hover:border-signal disabled:opacity-50">
                  {done.has("serial") ? "Used ✓" : "Use (it matches the photo)"}
                </button>
              )}
            </p>
          )}
          {note && (
            <p role="status" className="mt-1 text-xs text-slate" data-testid="meter-note">
              {note}
            </p>
          )}
          <p className="mt-2 text-xs text-slate">A guide only: you are responsible for the reading recorded.</p>
        </div>
      )}
    </div>
  );
}
