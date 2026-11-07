import type { EvidenceResult } from "@/lib/evidenceCheck";

const SHOWN = 8;

// A short "before you finish" note on an inventory, shown above the Mark inspection complete button. It never blocks anything.
export default function EvidenceCheck({ result }: { result: EvidenceResult }) {
  const { findings, counts } = result;
  if (findings.length === 0) return null;
  const important = counts.important > 0;
  const shown = findings.slice(0, SHOWN);
  return (
    <section
      aria-label="Evidence check"
      className={`mt-6 rounded-xl border p-4 text-sm ${important ? "border-amber-300 bg-amber-50 text-amber-900" : "border-line bg-white text-slate"}`}
      data-testid="evidence-check"
    >
      <h3 className={`font-semibold ${important ? "text-amber-900" : "text-ink"}`}>
        {important ? "⚠ " : ""}Before you finish: {counts.important > 0 ? `${counts.important} thing${counts.important === 1 ? "" : "s"} to check` : `${counts.tip} suggestion${counts.tip === 1 ? "" : "s"}`}
      </h3>
      <ul className="mt-2 list-disc pl-5 space-y-1">
        {shown.map((f, i) => (
          <li key={i} className={f.level === "important" ? "font-medium" : ""}>
            {f.message}
          </li>
        ))}
      </ul>
      {findings.length > SHOWN && <p className="mt-1 text-xs">…and {findings.length - SHOWN} more.</p>}
      <p className="mt-2 text-xs">You can still complete the inspection. Clear notes and photos are your evidence if a deposit is disputed.</p>
    </section>
  );
}
