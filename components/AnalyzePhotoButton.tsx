"use client";

import { setReactControlledValue } from "@/lib/reactInputHelper";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { appendItemNotes } from "@/lib/actions/inspections";

// Sits once per item/field (not once per photo) — analyzes ALL its photos together in a
// single combined description, since multiple photos of the same item are usually just
// different angles of one situation, not separate issues.
export default function AnalyzePhotoButton({
  photoUrls,
  targetId,
  itemId,
  inspectionId,
  context,
  identifyRoom,
}: {
  photoUrls: string[];
  targetId?: string;
  itemId?: string;
  inspectionId?: string;
  context?: string;
  // Set this when photos might be pooled from different rooms with no already-known room
  // per photo (e.g. a single Maintenance section covering the whole property) — the AI will
  // try to identify each photo's room from what's visible and give a per-photo breakdown,
  // instead of assuming every photo is the same item and writing one combined description.
  identifyRoom?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<"openai" | "anthropic">("anthropic");

  const analyze = async () => {
    if (photoUrls.length === 0) return;
    setLoading(true);
    setError("");
    setResult("");
    setSaved(false);

    // If there's already text in the linked notes field (e.g. the inspector typed
    // "damp in bedroom 2" before running analysis), pass it along — it's a much stronger
    // hint for identifying the room than the photo alone.
    const existingNotes = targetId ? (document.getElementById(targetId) as HTMLTextAreaElement | null)?.value.trim() : "";

    try {
      const res = await fetch("/api/ai/analyze-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoUrls, context, provider, identifyRoom, existingNotes, inspectionId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      if (targetId) {
        const target = document.getElementById(targetId) as HTMLTextAreaElement | null;
        if (target) {
          const existing = target.value.trim();
          setReactControlledValue(target, existing ? `${existing}\n\n${data.description}` : data.description);
        }
      } else {
        setResult(data.description);
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const saveToNotes = async () => {
    if (!itemId || !inspectionId || !result) return;
    setSaving(true);
    try {
      await appendItemNotes(itemId, result, inspectionId);
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (photoUrls.length === 0) return null;

  return (
    <div className="mt-1">
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="text-xs px-2.5 py-1 rounded-full border border-line text-slate hover:border-signal hover:text-signal transition-colors disabled:opacity-50"
        >
          {loading
            ? photoUrls.length > 15
              ? `Analysing ${photoUrls.length} photos… this may take up to a minute`
              : "Analysing…"
            : photoUrls.length > 1
            ? `👁 Analyse all ${photoUrls.length} photos with AI`
            : "👁 Analyse with AI"}
        </button>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as "openai" | "anthropic")}
          className="text-xs border border-line rounded-full px-2 py-1 text-slate bg-white"
        >
          <option value="anthropic">Claude</option>
          <option value="openai">OpenAI</option>
        </select>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {result && (
        <div className="mt-1 max-w-xs">
          <p className="text-xs text-ink bg-paper rounded-lg p-2">{result}</p>
          {itemId && inspectionId && !saved && (
            <button
              type="button"
              onClick={saveToNotes}
              disabled={saving}
              className="text-xs px-2.5 py-1 mt-1 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "💾 Save to notes"}
            </button>
          )}
          {saved && <p className="text-xs text-verified mt-1">Saved to item notes.</p>}
        </div>
      )}
    </div>
  );
}
