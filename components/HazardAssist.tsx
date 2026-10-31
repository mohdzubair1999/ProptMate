"use client";

import { useState } from "react";
import { setReactControlledValue, setReactSelectValue } from "@/lib/reactInputHelper";
import type { HazardSuggestion } from "@/lib/hazardAssess";
import { reportAiOutcome } from "@/lib/aiOutcome";

type Reply = { suggestion: HazardSuggestion; previous: { date: string | null; severity: string | null; extent: string | null } | null; photosUsed: number; previousPhotosUsed: number };
const BADGE: Record<string, string> = { high: "bg-green-100 text-green-800", medium: "bg-amber-100 text-amber-800", low: "bg-slate-100 text-slate-700" };

// "Assess with AI" for the photos of a damp and mould section. It SUGGESTS answers for the Yes/No, Severity and Location boxes
// on the page; the inspector presses Use for each one. Nothing is filled in by itself, and nothing the inspector has already
// recorded as more serious is ever lowered.
export default function HazardAssist({
  inspectionId,
  photoFieldId,
  signsFieldId,
  severityFieldId,
  locationFieldId,
  compareToInspectionId,
}: {
  inspectionId: string;
  photoFieldId: string;
  signsFieldId: string | null;
  severityFieldId: string | null;
  locationFieldId: string | null;
  compareToInspectionId?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState<Reply | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);

  const find = (id: string | null) => (id ? document.getElementById(`field-${id}`) : null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setReply(null);
    setDone(new Set());
    setNote(null);
    try {
      const res = await fetch("/api/ai/assess-hazard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inspectionId, photoFieldId, compareToInspectionId: compareToInspectionId ?? undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(typeof data?.error === "string" ? data.error : "The assessment didn't work - please try again");
      else {
        setReply(data as Reply);
        const sg = (data as Reply).suggestion;
        reportAiOutcome("damp_assessment", sg.signs || sg.severity ? "shown_offered" : "shown_declined", sg.confidence);
      }
    } catch {
      setError("Couldn't reach the AI - check your connection and try again");
    } finally {
      setBusy(false);
    }
  };

  const mark = (k: string) => setDone((prev) => new Set(prev).add(k));
  const missing = () => setNote("Couldn't find that box on the page.");

  const used = (silent: boolean) => {
    if (!silent) reportAiOutcome("damp_assessment", "used", reply?.suggestion.confidence);
  };
  const useSigns = (silent = false): boolean => {
    const s = reply?.suggestion;
    const el = find(signsFieldId) as HTMLSelectElement | null;
    if (!s?.signs || !el) { missing(); return false; }
    // never turn the inspector's "Yes" into "No"
    if (el.value && el.value.trim().toLowerCase() === "yes" && s.signs.trim().toLowerCase() === "no") { setNote('You have recorded "Yes". Keep your answer.'); return false; }
    if (!setReactSelectValue(el, s.signs)) { missing(); return false; }
    mark("signs");
    used(silent);
    return true;
  };
  const useSeverity = (silent = false): boolean => {
    const s = reply?.suggestion;
    const el = find(severityFieldId) as HTMLSelectElement | null;
    if (!s?.severity || !el || !setReactSelectValue(el, s.severity)) { missing(); return false; }
    mark("severity");
    used(silent);
    return true;
  };
  const addText = (key: string, text: string | null, silent = false): boolean => {
    const el = find(locationFieldId) as HTMLTextAreaElement | HTMLInputElement | null;
    if (!text || !el) { missing(); return false; }
    const current = (el.value || "").trim();
    if (current.includes(text)) { mark(key); return true; }
    setReactControlledValue(el as HTMLElement, current ? `${current}\n${text}` : text);
    mark(key);
    used(silent);
    return true;
  };
  const trendText = reply?.suggestion.trend && reply.previous?.date ? `Compared with the visit on ${reply.previous.date}: ${reply.suggestion.trend.note}` : reply?.suggestion.trend ? `Compared with the previous visit: ${reply.suggestion.trend.note}` : null;

  const s = reply?.suggestion;
  const canSigns = !!(s?.signs && signsFieldId), canSeverity = !!(s?.severity && severityFieldId), canLocation = !!(s?.location && locationFieldId), canTrend = !!(trendText && locationFieldId);

  return (
    <div className="mb-2" data-testid="hazard-assist">
      <button type="button" onClick={run} disabled={busy} className="text-xs px-3 py-1.5 rounded-full border border-line text-ink hover:border-signal transition-colors disabled:opacity-50">
        {busy ? "Assessing…" : "👁 Assess damp and mould with AI"}
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-700 mt-1">
          {error}
        </p>
      )}
      {s && (
        <div className="mt-2 rounded-lg border border-line bg-paper p-3 text-sm max-w-xl" data-testid="hazard-result">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-ink">Suggestion from the photos</p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[s.confidence]}`} data-testid="hazard-confidence">
              {s.confidence === "high" ? "High" : s.confidence === "medium" ? "Medium" : "Low"} confidence
            </span>
          </div>
          <p className="text-xs text-slate mt-0.5">A guide only. You decide what is recorded, and nothing is filled in until you press Use.</p>
          {s.observations.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-xs text-ink space-y-0.5" data-testid="hazard-observations">
              {s.observations.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 space-y-1.5 text-xs">
            {s.signsRaw === "unclear" ? (
              <p className="text-slate" data-testid="hazard-signs">Signs of damp or mould: cannot tell from these photos.</p>
            ) : s.signs ? (
              <p data-testid="hazard-signs">
                Signs of damp or mould: <span className="font-semibold">{s.signs}</span>{" "}
                {canSigns && (
                  <button type="button" onClick={() => useSigns()} disabled={done.has("signs")} className="ml-1 px-2 py-0.5 rounded-full border border-line hover:border-signal disabled:opacity-50">
                    {done.has("signs") ? "Used ✓" : "Use"}
                  </button>
                )}
              </p>
            ) : null}
            {s.severity ? (
              <p data-testid="hazard-severity">
                Severity: <span className="font-semibold">{s.severity}</span>{" "}
                {canSeverity && (
                  <button type="button" onClick={() => useSeverity()} disabled={done.has("severity")} className="ml-1 px-2 py-0.5 rounded-full border border-line hover:border-signal disabled:opacity-50">
                    {done.has("severity") ? "Used ✓" : "Use"}
                  </button>
                )}
              </p>
            ) : s.severityNote ? (
              <p className="text-slate" data-testid="hazard-severity-note">{s.severityNote}</p>
            ) : null}
            {s.location && (
              <p data-testid="hazard-location">
                Location and extent: {s.location}{" "}
                {canLocation && (
                  <button type="button" onClick={() => addText("location", s.location)} disabled={done.has("location")} className="ml-1 px-2 py-0.5 rounded-full border border-line hover:border-signal disabled:opacity-50">
                    {done.has("location") ? "Added ✓" : "Add to the notes"}
                  </button>
                )}
              </p>
            )}
            {trendText && (
              <p data-testid="hazard-trend">
                {trendText}
                {reply?.previous?.severity || reply?.previous?.extent ? <span className="text-slate"> (Recorded then: {[reply?.previous?.severity, reply?.previous?.extent].filter(Boolean).join("; ")})</span> : null}{" "}
                {canTrend && (
                  <button type="button" onClick={() => addText("trend", trendText)} disabled={done.has("trend")} className="ml-1 px-2 py-0.5 rounded-full border border-line hover:border-signal disabled:opacity-50">
                    {done.has("trend") ? "Added ✓" : "Add to the notes"}
                  </button>
                )}
              </p>
            )}
            {s.closerPhotos && <p className="text-slate" data-testid="hazard-closer">To judge better, photograph: {s.closerPhotos}</p>}
          </div>
          {(canSigns || canSeverity || canLocation || canTrend) && (
            <button
              type="button"
              data-testid="hazard-use-all"
              onClick={() => {
                reportAiOutcome("damp_assessment", "used_all", s.confidence);
                if (canSigns && !done.has("signs")) useSigns(true);
                if (canSeverity && !done.has("severity")) useSeverity(true);
                if (canLocation && !done.has("location")) addText("location", s.location, true);
                if (canTrend && !done.has("trend")) addText("trend", trendText, true);
              }}
              className="mt-2 text-xs px-3 py-1 rounded-full bg-ink text-white hover:bg-signal transition-colors"
            >
              Use all suggestions
            </button>
          )}
          {note && (
            <p role="status" className="mt-1 text-xs text-amber-900" data-testid="hazard-note">
              {note}
            </p>
          )}
          {s.warnings.length > 0 && (
            <p className="mt-1 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-1.5" data-testid="hazard-warnings">
              Left out of the suggestion: {s.warnings.join("; ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
