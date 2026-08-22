"use client";

import { useState } from "react";
import { addInspectionItemDirect } from "@/lib/actions/inspections";
import { queueWrite } from "@/lib/offlineQueue";
import { CONDITION_OPTIONS } from "@/lib/inventoryConditions";
import { CLEANLINESS_OPTIONS } from "@/lib/inventoryCleanliness";
import { isApplianceItem, isQuantityItem } from "@/lib/standardInventoryItems";

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
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [cleanliness, setCleanliness] = useState("");
  const [cleanlinessCustom, setCleanlinessCustom] = useState("");
  const [saving, setSaving] = useState(false);
  const [addedThisSession, setAddedThisSession] = useState<string[]>([]);

  const alreadyAddedLower = new Set([...alreadyAddedNames, ...addedThisSession].map((n) => n.toLowerCase()));
  const remaining = standardItems.filter((item) => !alreadyAddedLower.has(item.toLowerCase()));

  if (remaining.length === 0) return null;

  const handleSelect = (item: string) => {
    setSelected(item);
    setCondition("");
    setMake("");
    setQuantity("");
    setNotes("");
    setCleanliness("");
    setCleanlinessCustom("");
  };

  const handleAdd = async () => {
    if (!selected || !condition) return;
    setSaving(true);
    const parsedQuantity = quantity.trim() ? parseInt(quantity, 10) : undefined;
    const cleanlinessValue = cleanliness === "custom" ? cleanlinessCustom.trim() : cleanliness;
    try {
      await addInspectionItemDirect(inspectionId, room, selected, condition, templateFieldId, make, parsedQuantity, notes, cleanlinessValue || undefined);
    } catch {
      // Most commonly means signal was lost mid-inspection — the item is queued locally and
      // synced automatically once connection returns, rather than the whole "add item"
      // action just failing outright and losing what was just captured.
      await queueWrite({
        type: "addInspectionItem",
        args: [inspectionId, room, selected, condition, templateFieldId, make, parsedQuantity, notes, cleanlinessValue || undefined],
      });
    } finally {
      setAddedThisSession((prev) => [...prev, selected]);
      setSelected(null);
      setCondition("");
      setMake("");
      setQuantity("");
      setNotes("");
      setCleanliness("");
      setCleanlinessCustom("");
      setSaving(false);
    }
  };

  const selectedIsAppliance = selected ? isApplianceItem(selected) : false;
  const selectedIsQuantityItem = selected ? isQuantityItem(selected) : false;

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

          {selectedIsQuantityItem && (
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate">How many:</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="e.g. 3"
                disabled={saving}
                className="w-24 border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
              />
            </div>
          )}

          {condition && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="text-sm text-slate">Cleanliness:</label>
              <select
                value={cleanliness}
                onChange={(e) => setCleanliness(e.target.value)}
                disabled={saving}
                className="border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
              >
                <option value="">Not assessed</option>
                {CLEANLINESS_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              {cleanliness === "custom" && (
                <input
                  type="text"
                  value={cleanlinessCustom}
                  onChange={(e) => setCleanlinessCustom(e.target.value)}
                  placeholder="Describe cleanliness"
                  disabled={saving}
                  className="border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                />
              )}
            </div>
          )}

          {condition && (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Comments (optional)"
              rows={2}
              disabled={saving}
              className="w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
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
