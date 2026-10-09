"use client";

import { useState } from "react";
import { updateInventoryItem } from "@/lib/actions/inspections";
import { CONDITION_LABELS, CONDITION_STYLES } from "@/lib/inventoryConditions";
import { CLEANLINESS_LABELS, CLEANLINESS_STYLES } from "@/lib/inventoryCleanliness";

type Defect = { description: string; location: string | null; severity: string; type: string | null };
type Assessment = {
  condition: string;
  cleanliness: string | null;
  summary: string;
  defects: Defect[];
  changes: string[];
  confidence: string;
  photoNote: string | null;
  depth: "standard" | "deep";
  photosUsed: number;
  checkIn: { photos: number } | null;
};
type Current = { condition: string; make: string | null; quantity: number | null; notes: string | null; cleanliness: string | null };

const SEVERITY_STYLES: Record<string, string> = { minor: "bg-slate/10 text-slate", moderate: "bg-orange-100 text-orange-700", major: "bg-red-100 text-red-700" };
const CONFIDENCE_LABELS: Record<string, string> = { high: "High confidence", medium: "Medium confidence", low: "Low confidence - check carefully" };

// Suggests a condition, cleanliness and short factual description for one item from its own
// photos (and, at check-out, from the check-in photos too). It only ever SUGGESTS: nothing changes
// on the item until the person presses Apply or Add to notes.
export default function AiAssessItem({ itemId, current }: { itemId: string; current: Current }) {
  const [loading, setLoading] = useState<null | "standard" | "deep">(null);
  const [result, setResult] = useState<Assessment | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"" | "applied" | "notes" | "both">("");
  const [saving, setSaving] = useState(false);
  // What is saved on the item right now, kept up to date as suggestions are applied so a second
  // action never writes back an older value over the first.
  const [latest, setLatest] = useState<Current>(current);

  const run = async (depth: "standard" | "deep") => {
    setLoading(depth);
    setError("");
    setDone("");
    try {
      const res = await fetch("/api/ai/assess-item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId, depth }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(null);
        setError(data?.error || "Something went wrong - please try again");
      } else {
        setResult(data as Assessment);
      }
    } catch {
      setError("Couldn't reach the server - check your connection and try again");
    } finally {
      setLoading(null);
    }
  };

  const save = async (next: Current, mark: "applied" | "notes") => {
    setSaving(true);
    setError("");
    try {
      await updateInventoryItem(itemId, next.condition, next.make || undefined, next.quantity || undefined, next.notes || undefined, next.cleanliness || undefined);
      setLatest(next);
      setDone((d) => (d && d !== mark ? "both" : mark));
    } catch {
      setError("Couldn't save - check your connection and try again");
    } finally {
      setSaving(false);
    }
  };

  const applyRatings = () => result && save({ ...latest, condition: result.condition, cleanliness: result.cleanliness || latest.cleanliness }, "applied");
  const addToNotes = () => result && save({ ...latest, notes: latest.notes ? `${latest.notes}\n${result.summary}` : result.summary }, "notes");

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => run("standard")} disabled={!!loading} className="text-xs border border-signal text-signal rounded-full px-3 py-1 hover:bg-signal/10 transition-colors disabled:opacity-50">
          {loading === "standard" ? "Analysing…" : "✨ Suggest condition"}
        </button>
        <button
          type="button"
          onClick={() => run("deep")}
          disabled={!!loading}
          title="Uses a more capable AI model. Slower and costs more - best kept for tricky items."
          className="text-xs border border-line text-slate rounded-full px-3 py-1 hover:border-signal hover:text-signal transition-colors disabled:opacity-50"
        >
          {loading === "deep" ? "Analysing in depth…" : "Deep"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>

      {result && (
        <div className="mt-2 border border-signal/30 bg-signal/5 rounded-lg p-3 text-sm max-w-lg">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate">AI suggests</span>
            <span className={`text-xs px-2 py-1 rounded-full ${CONDITION_STYLES[result.condition] || "bg-slate/10 text-slate"}`}>{CONDITION_LABELS[result.condition] || result.condition}</span>
            {result.cleanliness && <span className={`text-xs px-2 py-1 rounded-full ${CLEANLINESS_STYLES[result.cleanliness] || "bg-slate/10 text-slate"}`}>{CLEANLINESS_LABELS[result.cleanliness] || result.cleanliness}</span>}
            <span className="text-xs text-slate">
              {CONFIDENCE_LABELS[result.confidence] || result.confidence}
              {result.depth === "deep" ? " · deep analysis" : ""}
            </span>
          </div>

          <p className="mt-2 text-ink">{result.summary}</p>
          {result.photoNote && <p className="text-xs text-signal mt-1">{result.photoNote}</p>}

          {result.defects.length > 0 && (
            <ul className="mt-2 space-y-1">
              {result.defects.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-ink">
                  <span className={`px-1.5 py-0.5 rounded-full shrink-0 ${SEVERITY_STYLES[d.severity] || SEVERITY_STYLES.minor}`}>{d.severity}</span>
                  <span>
                    {d.description}
                    {d.location ? <span className="text-slate"> ({d.location})</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {result.checkIn && (
            <div className="mt-2 pt-2 border-t border-line">
              {result.checkIn.photos > 0 ? (
                <>
                  <p className="text-xs text-slate">Compared with {result.checkIn.photos} check-in photo{result.checkIn.photos === 1 ? "" : "s"}</p>
                  {result.changes.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {result.changes.map((c, i) => (
                        <li key={i} className="text-xs text-ink">
                          • {c}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-ink mt-1">No visible change since check-in.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-slate">A check-in record was found but it has no photos, so the photos couldn&apos;t be compared.</p>
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <button type="button" onClick={applyRatings} disabled={saving} className="text-xs bg-signal text-white rounded-full px-3 py-1 hover:opacity-90 disabled:opacity-50">
              Apply condition{result.cleanliness ? " & cleanliness" : ""}
            </button>
            <button type="button" onClick={addToNotes} disabled={saving} className="text-xs border border-line text-ink rounded-full px-3 py-1 hover:border-signal disabled:opacity-50">
              Add description to notes
            </button>
            <button type="button" onClick={() => { setResult(null); setDone(""); }} className="text-xs text-slate hover:text-ink">
              Dismiss
            </button>
            {(done === "applied" || done === "both") && <span className="text-xs text-verified">✓ Condition applied</span>}
            {(done === "notes" || done === "both") && <span className="text-xs text-verified">✓ Added to notes</span>}
          </div>
          <p className="text-[11px] text-slate mt-2">AI suggestion - please check it against the photos before relying on it.</p>
        </div>
      )}
    </div>
  );
}
