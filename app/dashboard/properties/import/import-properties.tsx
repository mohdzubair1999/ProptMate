"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { importProperties, type ImportResponse } from "@/lib/actions/propertyImport";
import { parseCsv } from "@/lib/csvParse";
import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS } from "@/lib/propertyImport";
import { toCsv } from "@/lib/csv";

const MAX_SEND_BYTES = 900_000; // the limit on what the browser may send in one go is 1 MB

// Import properties from a spreadsheet: choose a CSV file (or paste rows copied from Excel or Google Sheets), check the preview, then
// import. Nothing is saved until the Import button is pressed, and every row shows what will happen to it.
export default function ImportProperties() {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [done, setDone] = useState<ImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  // off by default: a property already in the system is left exactly as it is, unless this is ticked
  const [updateExisting, setUpdateExisting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setText(""); setFileName(null); setGrid(null); setPreview(null); setTruncated(false); setDone(null); setError(null); if (fileRef.current) fileRef.current.value = ""; };

  const check = async (source: string, update: boolean = updateExisting) => {
    setError(null); setPreview(null); setDone(null);
    const parsed = parseCsv(source);
    if (parsed.error) { setError(parsed.error); setGrid(null); return; }
    if (JSON.stringify(parsed.rows).length > MAX_SEND_BYTES) { setError("That file is too large to import in one go. Split it into smaller files."); setGrid(null); return; }
    setBusy(true);
    try {
      const res = await importProperties(parsed.rows, true, update);
      setGrid(parsed.rows); setTruncated(parsed.truncated); setPreview(res);
    } catch (err: any) {
      setError(err?.message || "Couldn't check that file - please try again."); setGrid(null);
    } finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileName(f.name);
    let content = "";
    try { content = await f.text(); } catch { setError("That file couldn't be read."); return; }
    setText(content);
    await check(content);
  };

  const runImport = async () => {
    if (!grid || busy) return;
    setBusy(true); setError(null);
    try { setDone(await importProperties(grid, false, updateExisting)); setPreview(null); }
    catch (err: any) { setError(err?.message || "The import didn't work - please try again."); }
    finally { setBusy(false); }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([toCsv([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE])], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "properties-template.csv"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  if (done) {
    const skipped = done.summary.errors + done.summary.duplicates;
    return (
      <div data-testid="import-done" className="bg-white border border-line rounded-xl p-6 max-w-2xl">
        <h2 className="font-display font-600 text-lg text-ink">{done.created === 0 && !done.updated ? "Nothing was imported" : `${done.created ? `Imported ${done.created} propert${done.created === 1 ? "y" : "ies"}` : ""}${done.created && done.updated ? " and " : ""}${done.updated ? `${done.created ? "updated" : "Updated"} ${done.updated} existing propert${done.updated === 1 ? "y" : "ies"}` : ""}`}</h2>
        {skipped > 0 && <p className="text-sm text-slate mt-1">{skipped} row{skipped === 1 ? " was" : "s were"} skipped (problems or properties you already have).</p>}
        <div className="mt-4 flex gap-3">
          <Link href="/dashboard/properties" className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90">View properties</Link>
          <button type="button" onClick={reset} className="border border-line text-ink px-5 py-2 rounded-full text-sm hover:border-ink">Import another file</button>
        </div>
      </div>
    );
  }

  const s = preview?.summary;
  return (
    <div className="max-w-4xl">
      <div className="bg-white border border-line rounded-xl p-5">
        <p className="text-sm text-ink font-semibold">1. Choose your spreadsheet</p>
        <p className="text-xs text-slate mt-1">Save it as CSV from Excel or Google Sheets, or paste the rows below. The first row must name the columns. Only <strong>Address</strong> is required; City, Postcode, Bedrooms, Type, Landlord name, Landlord address, Notes and Inspection frequency (months) are used if present. Up to 500 properties at a time.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" data-testid="import-file" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" />
          <button type="button" onClick={downloadTemplate} data-testid="import-template" className="text-xs underline text-signal">Download a template</button>
        </div>
        {fileName && <p className="text-xs text-slate mt-1" data-testid="import-filename">{fileName}</p>}
        <label className="mt-3 flex items-start gap-2 text-sm text-ink cursor-pointer">
          <input type="checkbox" checked={updateExisting} data-testid="import-update" onChange={(e) => { setUpdateExisting(e.target.checked); if (text.trim()) void check(text, e.target.checked); }} className="mt-1" />
          <span>Update properties I already have <span className="block text-xs text-slate">Matched by address and postcode. Only cells with something in them change anything: an empty cell never clears a value. You will see every change before it is saved.</span></span>
        </label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder="…or paste rows here (including the header row)" data-testid="import-text" className="mt-3 w-full border border-line rounded-lg px-3 py-2 text-sm font-mono" />
        <button type="button" disabled={busy || text.trim() === ""} onClick={() => check(text)} data-testid="import-check" className="mt-2 border border-line text-ink px-4 py-1.5 rounded-full text-sm hover:border-ink disabled:opacity-50">{busy && !preview ? "Checking…" : "Check the data"}</button>
      </div>

      {error && <p role="alert" className="text-sm text-red-700 mt-3" data-testid="import-error">{error}</p>}

      {preview && s && (
        <div className="mt-5" data-testid="import-preview">
          <p className="text-sm text-ink font-semibold">2. Check what will happen</p>
          {preview.missingAddress ? (
            <p className="text-sm text-red-700 mt-2" data-testid="import-noaddress">The first row needs a column called Address. Found: {grid?.[0]?.join(", ") || "nothing"}.</p>
          ) : (
            <>
              <p className="text-sm text-slate mt-1" data-testid="import-summary">{s.total} row{s.total === 1 ? "" : "s"}: <strong className="text-ink">{s.ok} will be imported</strong>{s.updates > 0 ? <>, <strong className="text-ink" data-testid="import-updates">{s.updates} will be updated</strong></> : null}{s.errors > 0 ? `, ${s.errors} ha${s.errors === 1 ? "s a problem" : "ve problems"}` : ""}{s.duplicates > 0 ? `, ${s.duplicates} already exist${s.duplicates === 1 ? "s" : ""} or repeat${s.duplicates === 1 ? "s" : ""}` : ""}.</p>
              {truncated && <p className="text-xs text-amber-800 mt-1" data-testid="import-truncated">Only the first 500 rows were read. Import the rest as a second file.</p>}
              {preview.ignored.length > 0 && <p className="text-xs text-slate mt-1" data-testid="import-ignored">Columns not used: {preview.ignored.join(", ")}.</p>}
              <div className="mt-3 border border-line rounded-xl bg-white overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-sm" data-testid="import-table">
                  <thead className="bg-paper text-left text-xs text-slate sticky top-0"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Address</th><th className="px-3 py-2">Postcode</th><th className="px-3 py-2">What will happen</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {preview.rows.map((r) => (
                      <tr key={r.row} data-testid="import-row" data-status={r.status}>
                        <td className="px-3 py-2 text-slate">{r.row}</td>
                        <td className="px-3 py-2 text-ink">{r.address || "(no address)"}</td>
                        <td className="px-3 py-2 text-slate">{r.values?.postcode ?? ""}</td>
                        <td className="px-3 py-2">
                          {r.status === "ok" ? <span className="text-emerald-800">Will be imported</span> : r.status === "update" ? <span className="text-sky-800" data-testid="import-changes">Will update: {(r.changes ?? []).map((c) => `${c.field} ${c.from} → ${c.to}`).join("; ")}</span> : r.status === "duplicate" ? <span className="text-amber-800">Skipped: {r.problems[0]}</span> : <span className="text-red-700">Problem: {r.problems.join("; ")}</span>}
                          {r.status === "ok" && r.warnings.length > 0 && <span className="block text-xs text-slate">{r.warnings.join("; ")}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button type="button" disabled={busy || s.ok + s.updates === 0} onClick={runImport} data-testid="import-go" className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 disabled:opacity-50">{busy ? "Importing…" : s.ok > 0 && s.updates > 0 ? `Import ${s.ok} and update ${s.updates}` : s.updates > 0 ? `Update ${s.updates} propert${s.updates === 1 ? "y" : "ies"}` : `Import ${s.ok} propert${s.ok === 1 ? "y" : "ies"}`}</button>
                <button type="button" onClick={reset} className="text-sm underline text-slate">Start again</button>
              </div>
              {s.ok + s.updates === 0 && <p className="text-xs text-slate mt-2">Nothing can be imported yet. Fix the problems in your spreadsheet and choose it again.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
