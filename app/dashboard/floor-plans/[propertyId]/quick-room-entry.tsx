"use client";

import { useMemo, useState } from "react";
import { parseRoomList, type ParsedRoom } from "@/lib/roomEntry";
import { PLAN_TEMPLATES } from "@/lib/floorPlanTemplates";

// Two quick ways to get rooms onto a plan without filling in a form for each one:
//  - Start from a typical layout (only offered on a blank plan): typical sizes, clearly marked as estimates.
//  - Quick add rooms: type, paste or dictate "Lounge 4.5 x 3.8, Kitchen 3.2 x 3.8" and add them all at once.
export default function QuickRoomEntry({
  blank,
  suggestedTemplateId,
  existingNames,
  onAdd,
  onTemplate,
}: {
  blank: boolean;
  suggestedTemplateId: string | null;
  existingNames: string[];
  onAdd: (rooms: ParsedRoom[]) => void;
  onTemplate: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [unit, setUnit] = useState<"m" | "ft">("m");
  const parsed = useMemo(() => parseRoomList(text, { defaultUnit: unit, existingNames }), [text, unit, existingNames.join("\u0001")]);
  const n = parsed.rooms.length;

  return (
    <div className="mb-4 rounded-lg border border-line bg-paper p-3 text-sm" data-testid="quick-entry">
      {blank && (
        <div data-testid="template-chooser" className="mb-3">
          <p className="font-semibold text-ink">Start from a typical layout</p>
          <p className="text-xs text-slate mt-0.5">Typical sizes, not measured. You will be asked for one real measurement to scale them all.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {PLAN_TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`template-${t.id}`}
                onClick={() => onTemplate(t.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${t.id === suggestedTemplateId ? "border-signal bg-white text-ink font-semibold" : "border-line text-ink hover:border-signal"}`}
              >
                {t.label}
                {t.id === suggestedTemplateId && <span className="ml-1.5 text-signal">Suggested</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <details open={blank} data-testid="quick-add">
        <summary className="cursor-pointer font-semibold text-ink">Quick add rooms</summary>
        <div className="mt-2">
          <label className="block text-xs text-slate" htmlFor="quick-rooms">
            Type, paste or dictate your rooms with their sizes. For example: Lounge 4.5 x 3.8, Kitchen 3.2 x 3.8, Bedroom 1 3.6 x 3.4
          </label>
          <textarea
            id="quick-rooms"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Lounge 4.5 x 3.8, Kitchen 3.2 x 3.8, Bedroom 1 3.6 x 3.4"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm"
          />
          <div className="mt-1 flex items-center gap-3 flex-wrap text-xs text-slate">
            <span>Sizes without a unit are in:</span>
            <label className="flex items-center gap-1">
              <input type="radio" name="quick-unit" checked={unit === "m"} onChange={() => setUnit("m")} /> metres
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="quick-unit" checked={unit === "ft"} onChange={() => setUnit("ft")} /> feet
            </label>
          </div>
          <p className="mt-1 text-xs text-slate">Tip: tap the microphone on your keyboard and say it, for example &ldquo;lounge four point five by three point eight, kitchen three point two by three point eight&rdquo;.</p>

          {n > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-ink" data-testid="quick-preview">
              {parsed.rooms.map((r, i) => (
                <li key={i}>
                  <span className="font-semibold">{r.name}</span>: {r.widthM} × {r.lengthM} m ({Math.round(r.widthM * r.lengthM * 10) / 10} m²)
                  <span className="text-slate"> from &ldquo;{r.sizeText}&rdquo;</span>
                </li>
              ))}
            </ul>
          )}
          {parsed.problems.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2" data-testid="quick-problems">
              {parsed.problems.map((p, i) => (
                <li key={i}>
                  Could not use &ldquo;{p.text}&rdquo;: {p.reason}
                </li>
              ))}
            </ul>
          )}
          {parsed.warnings.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-slate" data-testid="quick-warnings">
              {[...new Set(parsed.warnings)].map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <button
            type="button"
            data-testid="quick-add-button"
            disabled={n === 0}
            onClick={() => {
              onAdd(parsed.rooms);
              setText("");
            }}
            className="mt-2 text-xs px-4 py-1.5 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-40 disabled:hover:bg-ink"
          >
            {n === 0 ? "Add rooms" : `Add ${n} room${n === 1 ? "" : "s"}`}
          </button>
        </div>
      </details>
    </div>
  );
}
