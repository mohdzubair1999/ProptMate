"use client";

import { useState } from "react";
import { LANGUAGES } from "@/lib/translateReport";

type Result = { name: string; native: string; rtl: boolean; language: string; notice: string; address: string; words: Record<string, string>; report: { title: string; summary: string | null; sections: { heading: string; lines: { label: string | null; value: string }[] }[] } };

export default function TranslateReport({ inspectionId }: { inspectionId: string }) {
  const [language, setLanguage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (!language) { setError("Please choose a language"); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const res = await fetch("/api/ai/translate-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inspectionId, language }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setError(data?.error || "Couldn't translate that - please try again"); else setResult(data as Result);
    } catch { setError("Couldn't reach the server - please try again"); }
    setBusy(false);
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-3 items-center print:hidden">
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="border border-line rounded-lg px-3 py-2 text-sm bg-white" aria-label="Language" data-testid="translate-language">
          <option value="">Choose a language…</option>
          {LANGUAGES.map((l) => <option key={l.code} value={l.code}>{l.name} — {l.native}</option>)}
        </select>
        <button type="button" onClick={run} disabled={busy} className="bg-ink text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-signal disabled:opacity-50" data-testid="translate-run">{busy ? "Translating… (up to a minute)" : "Translate"}</button>
        {result && <button type="button" onClick={() => window.print()} className="border border-line px-4 py-2 rounded-full text-sm text-ink hover:border-ink">Print or save as PDF</button>}
      </div>
      {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}
      {result && (
        <article dir={result.rtl ? "rtl" : "ltr"} lang={result.language} className="mt-6 bg-white border border-line rounded-xl p-6 print:border-0 print:p-0" data-testid="translated-report">
          <p className="text-xs text-slate border border-line rounded-lg px-3 py-2 mb-4" data-testid="translate-notice">{result.notice}</p>
          <h2 className="font-display font-700 text-xl text-ink">{result.report.title}</h2>
          <p className="text-sm text-slate mt-1">{result.words.Property}: {result.address}</p>
          {result.report.summary && (<section className="mt-5"><h3 className="font-display font-600 text-ink">{result.words.Summary}</h3><p className="text-sm text-ink mt-1 whitespace-pre-wrap">{result.report.summary}</p></section>)}
          {result.report.sections.map((s, i) => (
            <section key={i} className="mt-5 break-inside-avoid">
              <h3 className="font-display font-600 text-ink border-b border-line pb-1">{s.heading}</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                {s.lines.map((l, j) => (<div key={j}>{l.label && <dt className="font-medium text-ink inline">{l.label}: </dt>}<dd className="inline text-slate whitespace-pre-wrap">{l.value}</dd></div>))}
              </dl>
            </section>
          ))}
        </article>
      )}
    </div>
  );
}
