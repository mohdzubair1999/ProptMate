"use client";

import { useState } from "react";
import { confirmJobStillThere, deleteMaintenanceJob, setMaintenanceJobStatus } from "@/lib/actions/maintenance";
import type { JobView } from "@/lib/maintenanceTracking";

const DOT: Record<string, string> = { urgent: "bg-red-500", "28-days": "bg-amber-500", routine: "bg-slate-400", monitor: "bg-sky-400" };
const STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", done: "Done" };
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB") : "");

// Tracked maintenance jobs. On the property page ("property") each job has a status you can change; at the next inspection
// ("checklist") each open job asks "was it dealt with?": Fixed closes it, Still there leaves it open and is only a reminder for this visit.
export default function MaintenanceJobList({ jobs: initial, mode, canRemove = false, inspectionId }: { jobs: JobView[]; mode: "property" | "checklist"; canRemove?: boolean; inspectionId?: string }) {
  const [jobs, setJobs] = useState<JobView[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  // jobs already confirmed as still there at THIS visit (saved, so it survives a reload)
  const [still, setStill] = useState<Set<string>>(new Set(initial.filter((j) => inspectionId && j.lastSeenInspectionId === inspectionId).map((j) => j.id)));

  const setStatus = async (id: string, status: string) => {
    setBusy(id);
    setError(null);
    try {
      // only a visit (the checklist) says which inspection it was fixed at; changing a status on the property page is not a visit
      const r = mode === "checklist" ? await setMaintenanceJobStatus(id, status, inspectionId) : await setMaintenanceJobStatus(id, status);
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, status: r.status, resolvedAt: r.resolvedAt, resolvedInspectionId: r.resolvedInspectionId } : j)));
    } catch (err: any) {
      setError({ id, message: err?.message || "Couldn't save that - please try again" });
    } finally {
      setBusy(null);
    }
  };
  const stillThere = async (id: string) => {
    if (!inspectionId) return;
    setBusy(id);
    setError(null);
    try {
      const r = await confirmJobStillThere(id, inspectionId);
      setStill((s) => new Set(s).add(id));
      setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, lastSeenInspectionId: inspectionId, lastSeenAt: r.lastSeenAt } : j)));
    } catch (err: any) {
      setError({ id, message: err?.message || "Couldn't save that - please try again" });
    } finally {
      setBusy(null);
    }
  };
  const remove = async (id: string) => {
    if (!window.confirm("Remove this job from the list? Use Done instead if it has been dealt with: finished jobs are kept as a record.")) return;
    setBusy(id);
    setError(null);
    try {
      await deleteMaintenanceJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (err: any) {
      setError({ id, message: err?.message || "Couldn't remove it - please try again" });
    } finally {
      setBusy(null);
    }
  };

  const open = jobs.filter((j) => j.status !== "done");
  const done = jobs.filter((j) => j.status === "done");
  const row = (j: JobView) => (
    <li key={j.id} className="px-4 py-3 text-sm" data-testid="job-row" data-status={j.status}>
      <div className="flex gap-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${DOT[j.urgency] ?? "bg-slate-400"}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={j.status === "done" ? "text-slate line-through" : "text-ink"}>
            <span className="font-semibold">[{j.timeframe}]</span> {j.area}: {j.text}
          </p>
          <p className="text-xs text-slate mt-0.5">
            Found {fmt(j.createdAt)}
            {j.status === "done" && j.resolvedAt ? ` · done ${fmt(j.resolvedAt)}${j.resolvedInspectionId ? " (confirmed at an inspection)" : ""}` : ""}
            {j.status !== "done" && j.lastSeenAt ? ` · last confirmed still there ${fmt(j.lastSeenAt)}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {mode === "property" ? (
              <>
                <select value={j.status} disabled={busy === j.id} onChange={(e) => setStatus(j.id, e.target.value)} aria-label="Status" data-testid="job-status" className="text-xs border border-line rounded-lg px-2 py-1">
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
                {canRemove && (
                  <button type="button" disabled={busy === j.id} onClick={() => remove(j.id)} data-testid="job-remove" className="text-xs text-red-600 underline disabled:opacity-50">
                    Remove
                  </button>
                )}
              </>
            ) : (
              <>
                <button type="button" disabled={busy === j.id} onClick={() => setStatus(j.id, "done")} data-testid="job-fixed" className="text-xs px-3 py-1 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50">
                  Fixed
                </button>
                <button type="button" disabled={busy === j.id || still.has(j.id)} onClick={() => stillThere(j.id)} data-testid="job-still" className="text-xs px-3 py-1 rounded-full border border-line hover:border-signal transition-colors disabled:opacity-60">
                  {still.has(j.id) ? "Still there ✓" : "Still there"}
                </button>
              </>
            )}
            {error?.id === j.id && (
              <span role="alert" className="text-xs text-red-700">
                {error.message}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );

  if (mode === "checklist" && open.length === 0) {
    return <p className="text-sm text-slate" data-testid="jobs-all-clear">All of the earlier jobs are now marked fixed.</p>;
  }
  return (
    <div data-testid="job-list">
      {open.length > 0 ? (
        <ul className="bg-white border border-line rounded-xl divide-y divide-line">{open.map(row)}</ul>
      ) : (
        <p className="text-sm text-slate" data-testid="jobs-none-open">No open jobs.</p>
      )}
      {mode === "property" && done.length > 0 && (
        <details className="mt-3" data-testid="jobs-finished">
          <summary className="text-sm text-slate cursor-pointer">Finished jobs ({done.length})</summary>
          <ul className="mt-2 bg-white border border-line rounded-xl divide-y divide-line">{done.map(row)}</ul>
        </details>
      )}
    </div>
  );
}
