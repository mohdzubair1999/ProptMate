"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DisputeRisk = {
  classification: string | null;
  reasoning: string | null;
  confidence: string | null;
  evidenceNote: string | null;
  assessedAt: string | null;
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  fair_wear_and_tear: "Fair wear and tear",
  tenant_responsibility: "Likely tenant responsibility",
  landlord_responsibility: "Landlord's own responsibility",
  unclear: "Unclear",
};

const CLASSIFICATION_STYLES: Record<string, string> = {
  fair_wear_and_tear: "bg-verified/10 text-verified",
  tenant_responsibility: "bg-red-100 text-red-700",
  landlord_responsibility: "bg-signal/10 text-signal",
  unclear: "bg-slate/10 text-slate",
};

export default function DisputeRiskBadge({ itemId, initial }: { itemId: string; initial: DisputeRisk }) {
  const router = useRouter();
  const [result, setResult] = useState<DisputeRisk | null>(initial.classification ? initial : null);
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const handleRun = async () => {
    setRunning(true);
    setError("");
    try {
      const res = await fetch("/api/ai/dispute-risk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't complete this assessment");
      setResult({ classification: data.classification, reasoning: data.reasoning, confidence: data.confidence, evidenceNote: data.evidenceNote, assessedAt: new Date().toISOString() });
      setExpanded(true);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't complete this assessment");
    } finally {
      setRunning(false);
    }
  };

  if (!result) {
    return (
      <div className="mt-2">
        <button onClick={handleRun} disabled={running} className="text-xs text-signal hover:underline disabled:opacity-50">
          {running ? "Assessing…" : "Assess dispute risk"}
        </button>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((e) => !e)}
        className={`text-xs px-2 py-1 rounded-full font-medium ${CLASSIFICATION_STYLES[result.classification || "unclear"]}`}
      >
        {CLASSIFICATION_LABELS[result.classification || "unclear"]}
        {result.confidence && result.confidence !== "high" && ` (${result.confidence} confidence)`}
      </button>

      {expanded && (
        <div className="mt-2 bg-paper border border-line rounded-lg p-3 text-xs space-y-2">
          <p className="text-ink">{result.reasoning}</p>
          {result.evidenceNote && <p className="text-slate italic">💡 {result.evidenceNote}</p>}
          {result.assessedAt && (
            <p className="text-slate/70">
              Assessed {new Date(result.assessedAt).toLocaleString("en-GB")} — if this item's condition or notes have changed since, re-assess to make sure this is still accurate.
            </p>
          )}
          <p className="text-slate/70 pt-1 border-t border-line">
            AI-generated starting point based on the photos and notes provided — not a legal determination. Use your own judgement, and your deposit scheme's own dispute process, for the final call.
          </p>
          <button onClick={handleRun} disabled={running} className="text-signal hover:underline disabled:opacity-50">
            {running ? "Re-assessing…" : "Re-assess"}
          </button>
          {error && <p className="text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
