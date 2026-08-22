"use client";

import { useState } from "react";
import { saveSummaryReferenceField } from "@/lib/actions/inspections";
import { queueWrite } from "@/lib/offlineQueue";

type Props = {
  inspectionId: string;
  initialValues: Record<string, string | null>;
};

const FIELDS: { key: string; label: string; multiline?: boolean; options?: string[] }[] = [
  { key: "propertyDescription", label: "Property description", multiline: true },
  { key: "clientName", label: "Client name" },
  { key: "clientAddress", label: "Client address", multiline: true },
  { key: "otherAlarmLocation", label: "Other alarm location" },
  { key: "otherAlarmTested", label: "Other alarm tested" },
  { key: "boilerLocation", label: "Boiler location" },
  { key: "stopcockLocation", label: "Stopcock location" },
  { key: "fuseBoxLocation", label: "Trip-switch/fuse box location" },
];

export default function SummaryReferenceSection({ inspectionId, initialValues }: Props) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initialValues);
  const [savedField, setSavedField] = useState<string | null>(null);
  const [queuedField, setQueuedField] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");

  const saveField = async (key: string, value: string) => {
    try {
      await saveSummaryReferenceField(inspectionId, key, value);
      setSavedField(key);
      setTimeout(() => setSavedField((f) => (f === key ? null : f)), 1200);
    } catch {
      await queueWrite({ type: "saveSummaryReferenceField", args: [inspectionId, key, value] });
      setQueuedField(key);
    }
  };

  const handleBlur = (key: string) => saveField(key, values[key] || "");

  // Discrete choices (dropdown) save immediately on change — the value is already final the
  // moment it's picked, unlike free-typed text where waiting for blur makes more sense.
  const handleSelectChange = (key: string, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    saveField(key, value);
  };

  const handleAiSuggest = async () => {
    setSuggesting(true);
    setSuggestError("");
    try {
      const res = await fetch("/api/ai/suggest-summary-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSuggestError(data.error || "Something went wrong");
        return;
      }

      // Only fills in fields that are currently empty — never overwrites something the
      // inspector already typed themselves, AI-suggested or not.
      const updates: Record<string, string> = {};
      for (const [key, value] of Object.entries(data.suggestions as Record<string, string>)) {
        if (value && !values[key]?.trim()) {
          updates[key] = value;
        }
      }

      if (Object.keys(updates).length === 0) return;

      setValues((v) => ({ ...v, ...updates }));
      for (const [key, value] of Object.entries(updates)) {
        await saveField(key, value);
      }
    } catch {
      setSuggestError("Something went wrong");
    } finally {
      setSuggesting(false);
    }
  };

  const filledCount = FIELDS.filter((f) => values[f.key]?.trim()).length;

  return (
    <section className="bg-white border border-line rounded-xl overflow-hidden mt-6">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between p-5 text-left hover:bg-paper transition-colors">
        <div>
          <h2 className="font-display font-600 text-ink">Summary Reference</h2>
          <p className="text-xs text-slate mt-0.5">
            Key location, alarms, meters, and general condition — {filledCount} of {FIELDS.length} filled in
          </p>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-slate transition-transform shrink-0 ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="p-5 pt-0 border-t border-line">
          <div className="flex items-center justify-between pt-4 pb-2">
            <p className="text-xs text-slate">
              AI can suggest a description, decorative order, cleaning, and gardens summary from your inspection notes — plus alarm/boiler/meter locations, but only if you've already recorded them as items somewhere in this inspection.
            </p>
            <button
              onClick={handleAiSuggest}
              disabled={suggesting}
              className="shrink-0 ml-4 border border-line text-ink px-3 py-1.5 rounded-full text-xs font-medium hover:border-ink transition-colors disabled:opacity-50"
            >
              {suggesting ? "Thinking…" : "Suggest with AI"}
            </button>
          </div>
          {suggestError && <p className="text-xs text-red-600 mb-3">{suggestError}</p>}

          <div className="grid sm:grid-cols-2 gap-4">
          {FIELDS.map((f) => (
            <div key={f.key} className={f.multiline ? "sm:col-span-2" : ""}>
              <label className="text-xs text-slate flex items-center gap-2">
                {f.label}
                {savedField === f.key && <span className="text-verified">✓ Saved</span>}
                {queuedField === f.key && <span className="text-signal">Saved locally — will sync</span>}
              </label>
              {f.options ? (
                <select
                  value={values[f.key] || ""}
                  onChange={(e) => handleSelectChange(f.key, e.target.value)}
                  className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                >
                  <option value="">Select…</option>
                  {f.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : f.multiline ? (
                <textarea
                  value={values[f.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onBlur={() => handleBlur(f.key)}
                  rows={2}
                  className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                />
              ) : (
                <input
                  type="text"
                  value={values[f.key] || ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  onBlur={() => handleBlur(f.key)}
                  className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                />
              )}
            </div>
          ))}
          </div>
        </div>
      )}
    </section>
  );
}
