"use client";

import { useState } from "react";

const PRESETS = ["3", "6", "12"];

export default function FrequencySelector({ initialValue }: { initialValue: number | null }) {
  const initialPreset = initialValue && PRESETS.includes(String(initialValue)) ? String(initialValue) : initialValue ? "custom" : "";
  const [preset, setPreset] = useState(initialPreset);
  const [customValue, setCustomValue] = useState(initialValue && !PRESETS.includes(String(initialValue)) ? String(initialValue) : "");

  return (
    <div>
      <label className="text-sm text-slate">Inspection frequency (optional)</label>
      <div className="mt-1 flex gap-2">
        <select
          value={preset}
          onChange={(e) => setPreset(e.target.value)}
          className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">Not set</option>
          <option value="3">Every 3 months</option>
          <option value="6">Every 6 months</option>
          <option value="12">Every 12 months</option>
          <option value="custom">Custom</option>
        </select>
        {preset === "custom" && (
          <input
            type="number"
            min="1"
            max="60"
            placeholder="Months"
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className="w-28 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
          />
        )}
      </div>
      <p className="text-xs text-slate mt-1">Used to suggest when the next inspection is due, based on the last completed one.</p>
      {/* The actual value submitted with the form — resolves preset vs custom into one number */}
      <input type="hidden" name="inspectionFrequencyMonths" value={preset === "custom" ? customValue : preset} />
    </div>
  );
}
