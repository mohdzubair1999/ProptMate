"use client";

import { useState } from "react";
import { addInspectionItemDirect } from "@/lib/actions/inspections";
import { CONDITION_OPTIONS } from "@/lib/inventoryConditions";
import { isApplianceItem } from "@/lib/standardInventoryItems";

export default function StandardItemsChecklist({
  inspectionId,
  templateFieldId,
  room,
  standardItems,
  alreadyAddedNames,
}: {
  inspectionId: string;
  templateFieldId: string;
  room: string;
  standardItems: string[];
  alreadyAddedNames: string[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [condition, setCondition] = useState("");
  const [make, setMake] = useState("");
  const [saving, setSaving] = useState(false);
  const [addedThisSession, setAddedThisSession] = useState<string[]>([]);

  const alreadyAddedLower = new Set([...alreadyAddedNames, ...addedThisSession].map((n) => n.toLowerCase()));
  const remaining = standardItems.filter((item) => !alreadyAddedLower.has(item.toLowerCase()));

  if (remaining.length === 0) return null;

  const handleSelect = (item: string) => {
    setSelected(item);
    setCondition("");
    setMake("");
  };

  const handleAdd = async () => {
    if (!selected || !condition) return;
    setSaving(true);
    try {
      await addInspectionItemDirect(inspectionId, room, selected, condition, templateFieldId, make);
      setAddedThisSession((prev) => [...prev, selected]);
      setSelected(null);
      setCondition("");
      setMake("");
    } finally {
      setSaving(false);
    }
  };

  const selectedIsAppliance = selected ? isApplianceItem(selected) : false;

  return (
    <div className="mb-3 bg-paper border border-line rounded-lg p-3">
      <p className="text-xs text-slate mb-2">Typical items for this room — select one to add it:</p>
      <div className="flex flex-wrap gap-2">
        {remaining.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => handleSelect(item)}
            disabled={saving}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              selected === item ? "border-signal bg-signal/10 text-signal" : "border-line text-slate hover:text-ink hover:border-ink"
            }`}
          >
            {item}
          </button>
        ))}
      </div>

      {selected && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-ink">{selected} —</span>
            <select
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              disabled={saving}
              autoFocus
              className="border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
            >
              <option value="">Select condition…</option>
              {CONDITION_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          {selectedIsAppliance && (
            <input
              type="text"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              placeholder="Make (optional), e.g. Bosch"
              disabled={saving}
              className="w-full max-w-xs border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
            />
          )}

          {condition && (
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-full bg-signal text-white hover:opacity-90 transition-opacity"
            >
              {saving ? "Adding…" : "✓ Add item"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
