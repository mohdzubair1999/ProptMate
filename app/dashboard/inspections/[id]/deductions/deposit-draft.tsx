"use client";
import { useState } from "react";
import Link from "next/link";
import { DEPOSIT_LABEL, formatPounds, lineAmountPence, scheduleTotalPence, scheduleText, serialiseDraft, tenantShare, type DraftLine, type PriceEntry } from "@/lib/depositEstimate";
import { saveDepositDraft } from "@/lib/actions/priceList";

export default function DepositDraft({ inspectionId, address, initialLines, entries, hasSaved }: { inspectionId: string; address: string; initialLines: DraftLine[]; entries: PriceEntry[]; hasSaved: boolean }) {
  const [lines, setLines] = useState(initialLines);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const set = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const pick = (key: string, entryId: string) => {
    const e = entries.find((x) => x.id === entryId);
    set(key, e ? { entryId, label: e.name, unitPence: e.pricePence, lifespanYears: e.lifespanYears, include: true } : { entryId: null });
  };
  const input = "border border-line rounded-lg px-2 py-1 text-sm";
  return (
    <div className="mt-3">
      <p className="text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg px-3 py-2" data-testid="deposit-label" role="note">{DEPOSIT_LABEL}</p>
      {entries.length === 0 && <p className="text-sm text-slate mt-3">Your price list is empty, so nothing could be suggested. <Link href="/dashboard/settings/price-list" className="text-signal hover:underline">Add prices</Link> or type each cost in by hand below.</p>}
      {lines.length === 0 && <p className="text-sm text-slate mt-3" data-testid="deposit-empty">No defects were found on this check-out. Items are listed here when the photo comparison flags a change, an item needs cleaning, or it is recorded as damaged. <Link href={`/dashboard/inspections/${inspectionId}/compare`} className="text-signal hover:underline">Compare photos with check-in</Link></p>}
      <ul className="mt-4 space-y-3">
        {lines.map((l) => (
          <li key={l.key} className="bg-white border border-line rounded-xl p-4 print:break-inside-avoid" data-testid="deposit-line">
            <label className="flex items-start gap-2"><input type="checkbox" checked={l.include} onChange={(e) => set(l.key, { include: e.target.checked })} className="mt-1 print:hidden" aria-label={`Include ${l.itemName}`} /><span><span className="text-sm font-medium text-ink">{l.room} - {l.itemName}</span><span className="block text-sm text-slate">{l.issue}</span></span></label>
            <div className="mt-3 grid sm:grid-cols-5 gap-2 items-end print:hidden">
              <div className="sm:col-span-2"><span className="block text-xs text-slate mb-1">Price line</span><select value={l.entryId ?? ""} onChange={(e) => pick(l.key, e.target.value)} className={`${input} w-full`}><option value="">Custom</option>{entries.map((e) => <option key={e.id} value={e.id}>{e.name} ({formatPounds(e.pricePence)})</option>)}</select></div>
              <div><span className="block text-xs text-slate mb-1">Cost each (£)</span><input inputMode="decimal" value={l.unitPence ? (l.unitPence / 100).toString() : ""} onChange={(e) => set(l.key, { unitPence: Math.round((Number(e.target.value) || 0) * 100), entryId: null })} className={`${input} w-full`} aria-label="Cost each in pounds" /></div>
              <div><span className="block text-xs text-slate mb-1">Quantity</span><input inputMode="numeric" value={l.qty} onChange={(e) => set(l.key, { qty: Math.max(0, Math.min(999, Number(e.target.value) || 0)) })} className={`${input} w-full`} aria-label="Quantity" /></div>
              <div><span className="block text-xs text-slate mb-1">Item age (yrs)</span><input inputMode="decimal" value={l.ageYears ?? ""} onChange={(e) => set(l.key, { ageYears: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} className={`${input} w-full`} aria-label="Item age in years" /></div>
            </div>
            {!l.entryId && <input value={l.label} onChange={(e) => set(l.key, { label: e.target.value })} placeholder="What the charge is for" className={`${input} w-full mt-2 print:hidden`} aria-label="Reason for the charge" />}
            <p className="text-sm mt-2 text-ink">{l.label || "Deduction"}{l.qty !== 1 ? ` x${l.qty}` : ""}{tenantShare(l.ageYears, l.lifespanYears) < 1 ? <span className="text-slate"> - {Math.round(tenantShare(l.ageYears, l.lifespanYears) * 100)}% after fair wear and tear</span> : null}: <strong data-testid="deposit-amount">{formatPounds(lineAmountPence(l))}</strong>{!l.include && <span className="text-slate"> (not included)</span>}</p>
          </li>
        ))}
      </ul>
      <div className="mt-5 flex items-center gap-3 flex-wrap">
        <p className="text-lg font-display font-600 text-ink">Total suggested: <span data-testid="deposit-total">{formatPounds(scheduleTotalPence(lines))}</span></p>
        <button onClick={async () => { const r = await saveDepositDraft(inspectionId, serialiseDraft(lines)); setMsg(r.ok ? "Draft saved." : r.error || "Couldn't save."); }} className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium print:hidden" data-testid="deposit-save">Save draft</button>
        <button onClick={() => { navigator.clipboard.writeText(`${address}\n${scheduleText(lines)}`); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-sm text-slate hover:text-ink print:hidden">{copied ? "Copied" : "Copy as text"}</button>
        <button onClick={() => window.print()} className="text-sm text-slate hover:text-ink print:hidden">Print</button>
        {msg && <span className="text-sm text-slate print:hidden" role="status">{msg}</span>}
        {hasSaved && <span className="text-xs text-slate print:hidden">Showing your saved draft.</span>}
      </div>
      <p className="hidden print:block text-xs mt-4">{DEPOSIT_LABEL}</p>
    </div>
  );
}
