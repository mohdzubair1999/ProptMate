"use client";

import { useState } from "react";
import { setReactControlledValue } from "@/lib/reactInputHelper";
import type { MaintenanceJob } from "@/lib/maintenanceDraft";
import { trackMaintenanceJobs } from "@/lib/actions/maintenance";

const DOT: Record<string, string> = { urgent: "bg-red-500", "28-days": "bg-amber-500", routine: "bg-slate-400", monitor: "bg-sky-400" };

// A draft maintenance list built from the inspector's own answers, shown inside the Maintenance report section. It only ever
// repeats what was recorded; the inspector copies it or adds it to the notes, and edits it from there.
export default function MaintenanceDraft({ jobs, text, targetFieldId, inspectionId }: { jobs: MaintenanceJob[]; text: string; targetFieldId: string | null; inspectionId?: string }) {
  const [note, setNote] = useState<string | null>(null);
  const [tracking, setTracking] = useState(false);
  const [tracked, setTracked] = useState(false);
  if (jobs.length === 0) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote("Copied.");
    } catch {
      setNote("Couldn't copy here - select the list and copy it by hand.");
    }
  };
  // saves these jobs against the property, so they are followed up at the next visit instead of being lost in this report
  const track = async () => {
    if (!inspectionId || tracking) return;
    setTracking(true);
    try {
      const r = await trackMaintenanceJobs(inspectionId, jobs.map((j) => ({ urgency: j.urgency, timeframe: j.timeframe, area: j.area, text: j.text })));
      setTracked(true);
      setNote(r.added === 0 ? `Already being tracked (${r.skipped} job${r.skipped === 1 ? "" : "s"}).` : `Tracking ${r.added} job${r.added === 1 ? "" : "s"} on the property${r.skipped ? ` (${r.skipped} already tracked)` : ""}. You will see them at the next visit.`);
    } catch (err: any) {
      setNote(err?.message || "Couldn't track them - please try again.");
    } finally {
      setTracking(false);
    }
  };
  const addToNotes = () => {
    const el = targetFieldId ? (document.getElementById(`field-${targetFieldId}`) as HTMLElement | null) : null;
    if (!el) {
      setNote("Couldn't find the maintenance notes box on the page.");
      return;
    }
    const current = el.isContentEditable ? (el.textContent || "").trim() : ((el as HTMLTextAreaElement).value || "").trim();
    if (current.includes(text)) {
      setNote("Already added.");
      return;
    }
    setReactControlledValue(el, current ? `${current}\n\n${text}` : text);
    setNote("Added to the notes. Check it and edit as needed.");
  };

  return (
    <div className="px-5 py-4 border-t border-line bg-paper" data-testid="maintenance-draft">
      <p className="text-sm font-semibold text-ink">Draft maintenance list from your answers</p>
      <p className="text-xs text-slate mt-0.5">Built only from what you have recorded: items rated urgent or with a deadline, safety checks answered No, and damaged or worn items. Check it before you use it.</p>
      <ol className="mt-2 space-y-1 text-sm text-ink" data-testid="maintenance-jobs">
        {jobs.map((j, i) => (
          <li key={i} className="flex gap-2">
            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[j.urgency]}`} aria-hidden />
            <span>
              <span className="font-semibold">[{j.timeframe}]</span> {j.area}: {j.text}
            </span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex gap-2 flex-wrap">
        <button type="button" onClick={copy} className="text-xs px-3 py-1 rounded-full border border-line hover:border-signal transition-colors">
          Copy list
        </button>
        {inspectionId && (
          <button type="button" onClick={track} disabled={tracking || tracked} data-testid="track-jobs" className="text-xs px-3 py-1 rounded-full border border-line hover:border-signal transition-colors disabled:opacity-60">
            {tracking ? "Tracking…" : tracked ? "Tracked ✓" : "Track these jobs"}
          </button>
        )}
        {targetFieldId && (
          <button type="button" onClick={addToNotes} className="text-xs px-3 py-1 rounded-full bg-ink text-white hover:bg-signal transition-colors">
            Add to the maintenance notes
          </button>
        )}
      </div>
      {note && (
        <p role="status" className="mt-1 text-xs text-slate" data-testid="maintenance-note">
          {note}
        </p>
      )}
    </div>
  );
}
