"use client";

import { useState } from "react";
import { addSuggestedItems } from "@/lib/actions/aiItems";
import { CONDITION_LABELS, CONDITION_STYLES } from "@/lib/inventoryConditions";

type Suggested = { name: string; quantity: number | null; make: string | null; condition: string; note: string | null };

// Proposes a room's item list from the photos in its Photos section. It only suggests: every item
// starts ticked, the person unticks anything wrong, and nothing is added until they press Add.
export default function AiSuggestItems({ inspectionId, sectionId, templateFieldId }: { inspectionId: string; sectionId: string; templateFieldId: string }) {
  const [loading, setLoading] = useState<null | "standard" | "deep">(null);
  const [items, setItems] = useState<Suggested[] | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [adding, setAdding] = useState(false);

  const suggest = async (depth: "standard" | "deep") => {
    setLoading(depth);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/ai/identify-items", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ inspectionId, sectionId, depth }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setItems(null);
        setError(data?.error || "Something went wrong - please try again");
      } else if (!Array.isArray(data.items) || data.items.length === 0) {
        setItems(null);
        setMessage("The AI didn't spot any new items it was sure about. Try adding clearer photos of the room.");
      } else {
        setItems(data.items);
        setChecked(data.items.map(() => true));
      }
    } catch {
      setError("Couldn't reach the server - check your connection and try again");
    } finally {
      setLoading(null);
    }
  };

  const add = async () => {
    if (!items) return;
    const selected = items.filter((_, i) => checked[i]);
    if (selected.length === 0) return;
    setAdding(true);
    setError("");
    try {
      const res = await addSuggestedItems({ inspectionId, templateFieldId, items: selected });
      if (res.error) setError(res.error);
      else {
        setItems(null);
        setMessage(`Added ${res.added} item${res.added === 1 ? "" : "s"}. Check each one's condition below.`);
      }
    } catch {
      setError("Couldn't add the items - check your connection and try again");
    } finally {
      setAdding(false);
    }
  };

  const count = checked.filter(Boolean).length;

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => suggest("standard")} disabled={!!loading} className="text-xs border border-signal text-signal rounded-full px-3 py-1 hover:bg-signal/10 transition-colors disabled:opacity-50">
          {loading === "standard" ? "Looking at the photos…" : "✨ Suggest items from this room's photos"}
        </button>
        <button
          type="button"
          onClick={() => suggest("deep")}
          disabled={!!loading}
          title="Uses a more capable AI model. Slower and costs more - best kept for busy or hard-to-read rooms."
          className="text-xs border border-line text-slate rounded-full px-3 py-1 hover:border-signal hover:text-signal transition-colors disabled:opacity-50"
        >
          {loading === "deep" ? "Looking in depth…" : "Deep"}
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
        {message && !error && <span className="text-xs text-verified">{message}</span>}
      </div>

      {items && (
        <div className="mt-2 border border-signal/30 bg-signal/5 rounded-lg p-3 max-w-xl">
          <p className="text-xs text-slate mb-2">AI found these in the photos. Untick anything wrong, then add the rest.</p>
          <ul className="space-y-1.5">
            {items.map((it, i) => (
              <li key={i}>
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={!!checked[i]} onChange={() => setChecked((c) => c.map((v, j) => (j === i ? !v : v)))} className="mt-1" />
                  <span className="flex-1">
                    <span className="text-ink">
                      {it.quantity ? `${it.quantity}x ` : ""}
                      {it.name}
                    </span>
                    {it.make && <span className="text-slate"> — {it.make}</span>}
                    {it.note && <span className="block text-xs text-slate">{it.note}</span>}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${CONDITION_STYLES[it.condition] || "bg-slate/10 text-slate"}`}>{CONDITION_LABELS[it.condition] || it.condition}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={add} disabled={adding || count === 0} className="text-xs bg-signal text-white rounded-full px-3 py-1 hover:opacity-90 disabled:opacity-50">
              {adding ? "Adding…" : `Add ${count} item${count === 1 ? "" : "s"}`}
            </button>
            <button type="button" onClick={() => setItems(null)} className="text-xs text-slate hover:text-ink">
              Dismiss
            </button>
          </div>
          <p className="text-[11px] text-slate mt-2">AI suggestions - please check them against the photos.</p>
        </div>
      )}
    </div>
  );
}
