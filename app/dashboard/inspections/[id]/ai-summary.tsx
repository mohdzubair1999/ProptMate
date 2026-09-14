"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AiSummaryBox({ inspectionId, existingSummary }: { inspectionId: string; existingSummary?: string | null }) {
  const router = useRouter();
  const [summary, setSummary] = useState(existingSummary || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<"openai" | "anthropic">("anthropic");

  const generate = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, provider }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setSummary(data.summary);
      router.refresh();
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-10 bg-white border border-line rounded-xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-600 text-lg text-ink">AI summary</h2>
        <div className="flex items-center gap-2">
          <div className="flex text-xs border border-line rounded-full overflow-hidden">
            <button
              type="button"
              onClick={() => setProvider("anthropic")}
              className={`px-2 py-1 transition-colors ${provider === "anthropic" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
            >
              Claude
            </button>
            <button
              type="button"
              onClick={() => setProvider("openai")}
              className={`px-2 py-1 transition-colors ${provider === "openai" ? "bg-ink text-white" : "text-slate hover:text-ink"}`}
            >
              OpenAI
            </button>
          </div>
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50"
          >
            {loading ? "Generating…" : summary ? "Regenerate" : "✨ Generate summary"}
          </button>
        </div>
      </div>

      {summary ? (
        <p className="text-sm text-ink mt-4 leading-relaxed">{summary}</p>
      ) : (
        <p className="text-sm text-slate mt-3">
          Generate a short executive summary from everything captured in this inspection — good for the top of a report or a
          quick read before opening the full PDF.
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
    </section>
  );
}
