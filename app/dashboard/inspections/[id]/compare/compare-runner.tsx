"use client";
import { useState } from "react";
import Link from "next/link";
import { CHANGE_LABELS, needsReview } from "@/lib/changeKinds";

export type CompareRow = { id: string; room: string; itemName: string; beforeUrls: string[]; afterUrls: string[]; kind: string | null; summary: string | null; severity: string | null; confidence: string | null };

const BADGE: Record<string, string> = { no_change: "bg-verified/10 text-verified", better: "bg-verified/10 text-verified", cannot_compare: "bg-slate/10 text-slate", new_mark: "bg-signal/10 text-signal", worse: "bg-signal/10 text-signal", dirtier: "bg-signal/10 text-signal", missing: "bg-red-100 text-red-700", damage: "bg-red-100 text-red-700" };

export default function CompareRunner({ inspectionId, rows: initial }: { inspectionId: string; rows: CompareRow[] }) {
  const [rows, setRows] = useState(initial);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState("");
  const [onlyChanges, setOnlyChanges] = useState(false);

  const todo = rows.filter((r) => r.afterUrls.length > 0 && r.beforeUrls.length > 0);
  async function runOne(r: CompareRow) {
    const res = await fetch("/api/ai/compare-item", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: r.id }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "That item could not be compared");
    setRows((all) => all.map((x) => (x.id === r.id ? { ...x, kind: data.kind, summary: data.summary, severity: data.severity ?? null, confidence: data.confidence ?? null } : x)));
  }
  async function runAll() {
    setRunning(true); setError(""); setDone(0);
    const queue = [...todo];
    let failed = 0;
    // two at a time: quick enough, and gentle on the AI limits
    const worker = async () => { for (let r = queue.shift(); r; r = queue.shift()) { try { await runOne(r); } catch (e: any) { failed++; if (/lot of AI requests|set up/.test(String(e?.message))) { queue.length = 0; setError(e.message); } } setDone((d) => d + 1); } };
    await Promise.all([worker(), worker()]);
    if (failed && !error) setError(`${failed} item${failed === 1 ? "" : "s"} could not be compared. Run it again to retry them.`);
    setRunning(false);
  }

  const shown = rows.filter((r) => !onlyChanges || needsReview(r.kind));
  const flagged = rows.filter((r) => needsReview(r.kind)).length;
  return (
    <div className="mt-4">
      <p className="text-sm text-slate">The AI looks at each check-out photo next to the matching check-in photo and flags what changed. It is a second pair of eyes: look at both photos yourself before relying on a flag.</p>
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button onClick={runAll} disabled={running || todo.length === 0} data-testid="compare-run" className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50">
          {running ? `Comparing… ${done} of ${todo.length}` : `Compare ${todo.length} item${todo.length === 1 ? "" : "s"} with photos on both sides`}
        </button>
        <label className="text-sm text-slate flex items-center gap-2"><input type="checkbox" checked={onlyChanges} onChange={(e) => setOnlyChanges(e.target.checked)} /> Show only items that changed</label>
        <span className="text-sm text-slate" data-testid="compare-flagged">{flagged} flagged</span>
        {flagged > 0 && <Link href={`/dashboard/inspections/${inspectionId}/deductions`} className="text-sm text-signal hover:underline ml-auto">Draft the deposit schedule →</Link>}
      </div>
      {error && <p className="text-sm text-red-600 mt-2" role="alert">{error}</p>}
      <ul className="mt-5 space-y-3">
        {shown.map((r) => (
          <li key={r.id} className="bg-white border border-line rounded-xl p-4" data-testid="compare-row">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-ink">{r.room} - {r.itemName}</p>
              {r.kind && <span className={`text-xs px-2 py-0.5 rounded-full ${BADGE[r.kind] || "bg-slate/10 text-slate"}`}>{CHANGE_LABELS[r.kind] || r.kind}{r.severity && needsReview(r.kind) ? ` (${r.severity})` : ""}</span>}
              {r.confidence === "low" && <span className="text-xs text-slate">low confidence: check the photos</span>}
            </div>
            {r.summary && <p className="text-sm text-slate mt-1">{r.summary}</p>}
            <div className="grid grid-cols-2 gap-3 mt-3">
              {([["Check-in", r.beforeUrls], ["Check-out", r.afterUrls]] as const).map(([label, urls]) => (
                <div key={label}>
                  <p className="text-xs text-slate mb-1">{label}</p>
                  {urls.length === 0 ? <p className="text-xs text-slate border border-dashed border-line rounded-lg p-3">No photo</p> : <div className="flex gap-1.5 flex-wrap">{urls.slice(0, 3).map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`${label} photo of ${r.itemName}`} loading="lazy" className="w-24 h-24 rounded-lg object-cover border border-line" /></a>)}</div>}
                </div>
              ))}
            </div>
          </li>
        ))}
        {shown.length === 0 && <li className="text-sm text-slate">Nothing to show yet.</li>}
      </ul>
    </div>
  );
}
