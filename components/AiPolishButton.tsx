"use client";

import { setReactControlledValue } from "@/lib/reactInputHelper";
import { useState } from "react";

// Universal AI-assist button — attaches to any text field by id. Because every template's
// fields render through the same shared component, this one button definition applies to
// every TEXT and SHORT_TEXT field across all templates automatically. Nothing template-specific
// needed — adding a new template with TEXT fields gets AI polish for free.
export default function AiPolishButton({
  targetId,
  context,
  multiline = true,
}: {
  targetId: string;
  context: string;
  multiline?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [provider, setProvider] = useState<"openai" | "anthropic">("anthropic");

  const handleClick = async () => {
    const el = document.getElementById(targetId) as HTMLTextAreaElement | HTMLInputElement | null;
    if (!el) return;

    const text = el.value.trim();
    if (!text) {
      setError("Type a rough note first");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context, provider, style: multiline ? "sentence" : "short-phrase" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      setReactControlledValue(el, data.result);
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-1 flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="text-xs px-2.5 py-1 rounded-full border border-line text-slate hover:border-signal hover:text-signal transition-colors disabled:opacity-50"
      >
        {loading ? "Polishing…" : `✨ Polish with ${provider === "anthropic" ? "Claude" : "OpenAI"}`}
      </button>

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

      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
    </div>
  );
}
