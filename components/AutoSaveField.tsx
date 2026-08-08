"use client";

import { useRef, useState } from "react";
import { saveFieldValue } from "@/lib/actions/answers";

type Props = {
  inspectionId: string;
  fieldId: string;
  type: "TEXT" | "SHORT_TEXT" | "NUMBER" | "DATE" | "DROPDOWN" | "MULTIPLE_CHOICE" | "SCORE" | "YES_NO";
  initialValue: string;
  options?: string[];
  id?: string; // DOM id, so Voice/AI polish buttons elsewhere can still target this field
};

export default function AutoSaveField({ inspectionId, fieldId, type, initialValue, options = [], id }: Props) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSave = (v: string) => {
    setStatus("saving");
    saveFieldValue(inspectionId, fieldId, v)
      .then(() => {
        setStatus("saved");
        setTimeout(() => setStatus("idle"), 1200);
      })
      .catch(() => setStatus("idle"));
  };

  // Debounced save for free-typing fields — waits for a pause before saving, so it's not
  // firing a request on every single keystroke.
  const onTypingChange = (v: string) => {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSave(v), 800);
  };

  // Immediate save for discrete choices (dropdown, radio, date) — no need to wait/debounce,
  // the value is already final the moment it changes.
  const onDiscreteChange = (v: string) => {
    setValue(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    doSave(v);
  };

  const indicator =
    status === "saving" ? (
      <span className="text-xs text-slate">Saving…</span>
    ) : status === "saved" ? (
      <span className="text-xs text-verified">✓ Saved</span>
    ) : null;

  if (type === "TEXT") {
    return (
      <div>
        <textarea
          id={id}
          rows={2}
          value={value}
          onChange={(e) => onTypingChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  if (type === "SHORT_TEXT") {
    return (
      <div>
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onTypingChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  if (type === "NUMBER") {
    return (
      <div>
        <input
          type="number"
          value={value}
          onChange={(e) => onTypingChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  if (type === "DATE") {
    return (
      <div>
        <input
          type="date"
          value={value}
          onChange={(e) => onDiscreteChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  if (type === "DROPDOWN") {
    return (
      <div>
        <select
          value={value}
          onChange={(e) => onDiscreteChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  if (type === "MULTIPLE_CHOICE") {
    return (
      <div>
        <div className="flex flex-col gap-1.5">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" checked={value === o} onChange={() => onDiscreteChange(o)} className="accent-signal" />
              {o}
            </label>
          ))}
        </div>
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  if (type === "SCORE") {
    return (
      <div>
        <select
          value={value}
          onChange={(e) => onDiscreteChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">Select…</option>
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  if (type === "YES_NO") {
    return (
      <div>
        <select
          value={value}
          onChange={(e) => onDiscreteChange(e.target.value)}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">Select…</option>
          <option value="N/A">N/A</option>
          <option value="Yes">Yes</option>
          <option value="No">No</option>
        </select>
        {indicator && <div className="mt-1">{indicator}</div>}
      </div>
    );
  }

  return null;
}
