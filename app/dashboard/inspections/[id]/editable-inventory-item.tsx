"use client";

import { useState } from "react";
import { updateInventoryItem, deleteInventoryItem } from "@/lib/actions/inspections";
import { queueWrite } from "@/lib/offlineQueue";
import { CONDITION_OPTIONS, CONDITION_LABELS, CONDITION_STYLES } from "@/lib/inventoryConditions";
import { CLEANLINESS_OPTIONS, CLEANLINESS_LABELS, CLEANLINESS_PRESET_VALUES, CLEANLINESS_STYLES } from "@/lib/inventoryCleanliness";
import { isApplianceItem, isQuantityItem } from "@/lib/standardInventoryItems";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PhotoGridWithDelete from "./photo-grid-with-delete";
import PhotoUpload from "./photo-upload";
import AnalyzePhotoButton from "@/components/AnalyzePhotoButton";

type Item = {
  id: string;
  room?: string;
  itemName: string;
  condition: string;
  make: string | null;
  quantity: number | null;
  notes: string | null;
  cleanliness: string | null;
  photos: { id: string; url: string }[];
};

// inspectionId is only passed by the non-template flow, which is also the only place
// AI photo analysis currently exists — kept optional so this same component works for both
// flows without forcing the feature into template-view where it was never built.
export default function EditableInventoryItem({ item, isDraft, inspectionId }: { item: Item; isDraft: boolean; inspectionId?: string }) {
  const [editing, setEditing] = useState(false);
  const [condition, setCondition] = useState(item.condition);
  const [make, setMake] = useState(item.make || "");
  const [quantity, setQuantity] = useState(item.quantity ? String(item.quantity) : "");
  const [notes, setNotes] = useState(item.notes || "");
  // An existing custom (non-preset) value starts the dropdown on "custom" with that text
  // pre-filled, rather than silently discarding it as an unrecognised option.
  const initialIsPreset = !item.cleanliness || CLEANLINESS_PRESET_VALUES.has(item.cleanliness);
  const [cleanliness, setCleanliness] = useState(initialIsPreset ? item.cleanliness || "" : "custom");
  const [cleanlinessCustom, setCleanlinessCustom] = useState(initialIsPreset ? "" : item.cleanliness || "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "queued">("idle");

  const showMake = isApplianceItem(item.itemName) || !!item.make;
  const showQuantity = isQuantityItem(item.itemName) || !!item.quantity;

  const handleSave = async () => {
    setSaving(true);
    const parsedQuantity = quantity.trim() ? parseInt(quantity, 10) : undefined;
    const cleanlinessValue = cleanliness === "custom" ? cleanlinessCustom.trim() : cleanliness;
    try {
      await updateInventoryItem(item.id, condition, make || undefined, parsedQuantity, notes || undefined, cleanlinessValue || undefined);
      setStatus("saved");
    } catch {
      // Same offline-safety pattern as everywhere else in the inspection form — the edit is
      // queued locally and synced automatically once connection returns, rather than the
      // correction just being lost.
      await queueWrite({
        type: "updateInventoryItem",
        args: [item.id, condition, make || undefined, parsedQuantity, notes || undefined, cleanlinessValue || undefined],
      });
      setStatus("queued");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  if (!editing) {
    return (
      <div className="border border-line rounded-lg p-3 flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-ink">
            {item.room ? `${item.room} — ` : ""}
            {item.quantity ? `${item.quantity}x ` : ""}
            {item.itemName}
            {item.make && <span className="text-slate font-normal"> — {item.make}</span>}
          </p>
          {item.notes && <p className="text-sm text-slate mt-1">{item.notes}</p>}
          {item.photos.length > 0 && (
            <div className="mt-2">
              <PhotoGridWithDelete photos={item.photos} isDraft={isDraft} size="sm" />
            </div>
          )}
          {isDraft && item.photos.length > 0 && inspectionId && (
            <AnalyzePhotoButton
              photoUrls={item.photos.map((p) => p.url)}
              itemId={item.id}
              inspectionId={inspectionId}
              context={`${item.room ? item.room + " — " : ""}${item.itemName}`}
              existingNotesValue={item.notes || ""}
              matchRoom={item.room || undefined}
              matchLabel={item.itemName}
            />
          )}
          {isDraft && <PhotoUpload itemId={item.id} />}
          {status === "saved" && <p className="text-xs text-verified mt-1">✓ Saved</p>}
          {status === "queued" && <p className="text-xs text-signal mt-1">Saved locally — will sync</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {item.cleanliness && (
            <span className={`text-xs px-2 py-1 rounded-full ${CLEANLINESS_STYLES[item.cleanliness] || "bg-slate/10 text-slate"}`}>
              {CLEANLINESS_PRESET_VALUES.has(item.cleanliness) ? CLEANLINESS_LABELS[item.cleanliness] : item.cleanliness}
            </span>
          )}
          <span className={`text-xs px-2 py-1 rounded-full ${CONDITION_STYLES[item.condition] || "bg-slate/10 text-slate"}`}>
            {CONDITION_LABELS[item.condition] || item.condition}
          </span>
          {isDraft && (
            <button onClick={() => setEditing(true)} className="text-xs text-slate hover:text-ink underline">
              Edit
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border border-signal rounded-lg p-3 space-y-3">
      <p className="text-sm font-medium text-ink">{item.itemName}</p>

      <div>
        <label className="text-xs text-slate">Condition</label>
        <select value={condition} onChange={(e) => setCondition(e.target.value)} className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
          {CONDITION_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {showMake && (
        <div>
          <label className="text-xs text-slate">Make</label>
          <input type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Bosch" className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
      )}

      {showQuantity && (
        <div>
          <label className="text-xs text-slate">How many</label>
          <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="mt-1 w-24 border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
      )}

      <div>
        <label className="text-xs text-slate">Cleanliness</label>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <select value={cleanliness} onChange={(e) => setCleanliness(e.target.value)} className="border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
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
              className="border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
            />
          )}
        </div>
      </div>

      <div>
        <label className="text-xs text-slate">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="bg-signal text-white px-4 py-1.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="text-sm text-slate hover:text-ink">
            Cancel
          </button>
        </div>
        <form action={deleteInventoryItem.bind(null, item.id)}>
          <ConfirmSubmitButton confirmMessage="Remove this item entirely? This cannot be undone." className="text-xs text-red-600 hover:text-red-700 underline">
            Delete item
          </ConfirmSubmitButton>
        </form>
      </div>
    </div>
  );
}
