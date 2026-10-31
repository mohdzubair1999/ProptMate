"use client";

import { useState } from "react";

type Source = "written" | "unverified" | "estimated" | "calibrated";
export type SketchReview = { rooms: { name: string; source: Source }[]; warnings: string[]; unit: string };
type Props = {
  rooms: { name: string; widthM: string; lengthM: string }[];
  review: SketchReview;
  onCalibrate: (index: number, dimension: "width" | "length", valueM: number, includeWritten: boolean) => { error?: string; message?: string };
  onDismiss: () => void;
};

const BADGE: Record<Source, { label: string; cls: string }> = {
  written: { label: "From your sketch", cls: "bg-verified/10 text-verified" },
  calibrated: { label: "Scaled to your measurement", cls: "bg-signal/10 text-signal" },
  unverified: { label: "Check this", cls: "bg-amber-100 text-amber-800" },
  estimated: { label: "Estimated", cls: "bg-amber-100 text-amber-800" },
};

// Shown right after a sketch is read. Says, room by room, which sizes were read from the person's own writing and which
// are estimates, and lets them pin the whole plan to one real measurement.
export default function SketchReviewPanel({ rooms, review, onCalibrate, onDismiss }: Props) {
  const [index, setIndex] = useState(0);
  const [dimension, setDimension] = useState<"width" | "length">("width");
  const [value, setValue] = useState("");
  const [includeWritten, setIncludeWritten] = useState(false);
  const [result, setResult] = useState<{ error?: string; message?: string } | null>(null);

  const sourceOf = (name: string): Source | undefined => review.rooms.find((r) => r.name === name)?.source;
  const named = rooms.filter((r) => r.name.trim());
  const count = (s: Source) => named.filter((r) => sourceOf(r.name) === s).length;
  const written = count("written"), estimated = count("estimated"), check = count("unverified"), scaled = count("calibrated");
  const needsScale = estimated + check + scaled > 0;
  // Nothing to review on a floor with no named rooms (for example after undoing back to a blank plan)
  if (named.length === 0) return null;

  const apply = () => {
    const v = parseFloat(value.replace(",", "."));
    if (!Number.isFinite(v)) {
      setResult({ error: "Type the real measurement in metres, for example 4.5." });
      return;
    }
    setResult(onCalibrate(index, dimension, v, includeWritten));
  };

  return (
    <section aria-label="Check the sizes from your sketch" className="mt-3 rounded-xl border border-signal/40 bg-signal/5 p-4 text-sm" data-testid="sketch-review">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display font-600 text-ink">Check these sizes before you save</h3>
          <p className="text-slate mt-1" data-testid="sketch-summary">
            {named.length} room{named.length === 1 ? "" : "s"}:{" "}
            {[written && `${written} read from your sketch`, estimated && `${estimated} estimated`, check && `${check} to check`, scaled && `${scaled} scaled to your measurement`].filter(Boolean).join(", ") || "no sizes to check"}.
            {estimated + check > 0 && " Estimated sizes are typical for the room, not measured."}
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="text-xs text-slate hover:text-ink underline underline-offset-2 shrink-0">
          Dismiss
        </button>
      </div>

      <ul className="mt-3 divide-y divide-line rounded-lg border border-line bg-white" data-testid="sketch-rooms">
        {named.map((r) => {
          const src = sourceOf(r.name);
          return (
            <li key={r.name} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="text-ink">{r.name}</span>
              <span className="flex items-center gap-2">
                <span className="text-slate tabular-nums">
                  {r.widthM} m &times; {r.lengthM} m
                </span>
                {src && <span className={`text-xs rounded-full px-2 py-0.5 ${BADGE[src].cls}`}>{BADGE[src].label}</span>}
              </span>
            </li>
          );
        })}
      </ul>

      {review.warnings.length > 0 && (
        <ul className="mt-3 list-disc pl-5 space-y-1 text-amber-800" data-testid="sketch-warnings">
          {review.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      {needsScale && named.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-white p-3" data-testid="sketch-calibrate">
          <p className="font-semibold text-ink">Know one real measurement?</p>
          <p className="text-slate mt-0.5">Type it in and every estimated room is scaled to match. One real measurement fixes the scale for all the estimates, though the proportions are still the AI's reading.</p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate">
              Room
              <select value={index} onChange={(e) => setIndex(parseInt(e.target.value, 10))} className="mt-0.5 block border border-line rounded-lg px-2 py-1.5 text-sm text-ink">
                {rooms.map((r, i) => (r.name.trim() ? <option key={i} value={i}>{r.name}</option> : null))}
              </select>
            </label>
            <label className="text-xs text-slate">
              Side
              <select value={dimension} onChange={(e) => setDimension(e.target.value as "width" | "length")} className="mt-0.5 block border border-line rounded-lg px-2 py-1.5 text-sm text-ink">
                <option value="width">Width (left to right)</option>
                <option value="length">Length (top to bottom)</option>
              </select>
            </label>
            <label className="text-xs text-slate">
              Real size (metres)
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    apply();
                  }
                }}
                inputMode="decimal"
                placeholder="e.g. 4.5"
                className="mt-0.5 block w-28 border border-line rounded-lg px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <button type="button" onClick={apply} className="text-sm bg-ink text-white px-4 py-1.5 rounded-lg hover:bg-signal transition-colors">
              Apply measurement
            </button>
          </div>
          {written > 0 && (
            <label className="mt-2 flex items-center gap-2 text-xs text-slate">
              <input type="checkbox" checked={includeWritten} onChange={(e) => setIncludeWritten(e.target.checked)} />
              Also change the rooms read from my sketch
            </label>
          )}
          {result?.error && (
            <p role="alert" className="mt-2 text-red-600">
              {result.error}
            </p>
          )}
          {result?.message && (
            <p role="status" className="mt-2 text-verified">
              {result.message}
            </p>
          )}
        </div>
      )}

      <p className="mt-3 text-xs text-slate">Nothing here is saved until you click Save floor plan. You can still correct any room in the form below.</p>
    </section>
  );
}
