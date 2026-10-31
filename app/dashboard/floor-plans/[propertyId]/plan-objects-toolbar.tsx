"use client";

import React, { useEffect, useState } from "react";
import { type PlanObject, type Align, SYMBOLS, SYMBOL_GROUPS, SYMBOL_KINDS, type SymbolGroup, MAX_OBJECTS, MAX_LABEL_CHARS, cleanLabelText, drawObject, objectBounds } from "@/lib/floorPlanObjects";
import type { Placing } from "./plan-objects-layer";

// The buttons for adding furniture, labels and walls, and the panel for whatever is selected. Like the layer, it owns
// no data: every change goes back to the editor through onUpdate, so undo, redo and saving all just work.

const pill = (active: boolean) => `text-sm rounded-full px-3 py-1.5 transition-colors border ${active ? "text-signal border-signal bg-signal/10" : "text-ink border-line hover:border-signal"}`;
const smallBtn = "text-xs rounded-full px-3 py-1.5 border border-line text-ink hover:border-signal transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function NumField({ label, value, min, max, step, unit, onCommit, testId }: { label: string; value: number; min: number; max: number; step: number; unit?: string; onCommit: (v: number) => void; testId?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onCommit(Math.min(max, Math.max(min, v)));
    else setText(String(value));
  };
  return (
    <label className="flex items-center gap-1 text-xs text-slate">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step}
        value={text}
        data-testid={testId}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        style={{ fontSize: 16 }}
        className="w-20 rounded-lg border border-line px-2 py-1 text-ink"
      />
      {unit}
    </label>
  );
}

function Preview({ symbol }: { symbol: keyof typeof SYMBOLS }) {
  const def = SYMBOLS[symbol];
  const d = drawObject({ id: "p", kind: "symbol", symbol, x: def.w / 2, y: def.l / 2, w: def.w, l: def.l, rot: 0 }, 40, 0);
  const w = def.w * 40, l = def.l * 40;
  return (
    <svg width={38} height={38} viewBox={`${-3} ${-3} ${w + 6} ${l + 6}`} aria-hidden="true">
      {d.prims.map((p, i) => React.createElement(p.t, { key: i, ...Object.fromEntries(Object.entries(p.a).map(([k, v]) => [k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()), v])) }))}
    </svg>
  );
}

export default function PlanObjectsToolbar({
  placing,
  setPlacing,
  wallStart,
  objects,
  selectedIds,
  onUpdate,
  onDelete,
  onDuplicate,
  onSelectAll,
  onAlign,
  onDistribute,
}: {
  placing: Placing | null;
  setPlacing: (p: Placing | null) => void;
  wallStart: { x: number; y: number } | null;
  objects: PlanObject[];
  selectedIds: string[];
  onUpdate: (updater: (objs: PlanObject[]) => PlanObject[]) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSelectAll: () => void;
  onAlign: (how: Align) => void;
  onDistribute: (axis: "horizontal" | "vertical") => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [group, setGroup] = useState<SymbolGroup>("Bedroom");
  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const one = selected.length === 1 ? selected[0] : null;
  const full = objects.length >= MAX_OBJECTS;
  const patch = (id: string, fields: Partial<PlanObject>) => onUpdate((objs) => objs.map((o) => (o.id === id ? ({ ...o, ...fields } as PlanObject) : o)));

  const hint = (() => {
    if (!placing) return "";
    if (placing.type === "symbol") return `Click the plan to place the ${SYMBOLS[placing.symbol].label.toLowerCase()}`;
    if (placing.type === "label") return "Click the plan to place the label";
    return wallStart ? "Click where the wall ends - keep clicking to continue it" : "Click where the wall starts";
  })();

  return (
    <>
      <div className="inline-block" data-testid="furniture-menu-wrap">
        <button type="button" disabled={full} onClick={() => setPickerOpen((v) => !v)} title="Add a bed, sofa, bath, kitchen unit or other fitting" className={pill(pickerOpen || placing?.type === "symbol")} data-testid="furniture-button">
          ＋ Furniture ▾
        </button>
      </div>
      <button type="button" disabled={full} onClick={() => { setPickerOpen(false); setPlacing(placing?.type === "label" ? null : { type: "label" }); }} title="Add a text label anywhere on the plan" className={pill(placing?.type === "label")} data-testid="label-button">
        T Label
      </button>
      <button type="button" disabled={full} onClick={() => { setPickerOpen(false); setPlacing(placing?.type === "wall" ? null : { type: "wall" }); }} title="Add a free-standing wall or partition" className={pill(placing?.type === "wall")} data-testid="wall-button">
        ▬ Wall
      </button>

      {pickerOpen && (
      <div role="menu" className="w-full rounded-xl border border-line bg-white p-2" data-testid="furniture-picker">
        <div className="flex flex-wrap gap-1 mb-2">
          {SYMBOL_GROUPS.map((g) => (
            <button key={g} type="button" onClick={() => setGroup(g)} className={`text-xs rounded-full px-2.5 py-1 border ${g === group ? "text-signal border-signal bg-signal/10" : "border-line text-slate"}`}>
              {g}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 max-h-64 overflow-y-auto">
          {SYMBOL_KINDS.filter((k) => SYMBOLS[k].group === group).map((k) => (
            <button
              key={k}
              type="button"
              role="menuitem"
              data-symbol={k}
              onClick={() => {
                setPlacing({ type: "symbol", symbol: k });
                setPickerOpen(false);
              }}
              className="flex flex-col items-center gap-1 rounded-lg border border-line p-1.5 hover:border-signal text-center"
            >
              <Preview symbol={k} />
              <span className="text-[11px] leading-tight text-ink">{SYMBOLS[k].label}</span>
              <span className="text-[10px] text-slate">{SYMBOLS[k].w}×{SYMBOLS[k].l}m</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {(placing || selected.length > 0 || objects.length > 0) && (
        <div className="w-full flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-white/60 px-3 py-2" data-testid="objects-panel">
          {placing && (
            <>
              <span className="text-sm text-ink" data-testid="placing-hint">{hint}</span>
              <button type="button" onClick={() => setPlacing(null)} className={smallBtn} data-testid="placing-done">{placing.type === "wall" && wallStart ? "Done" : "Cancel"} (Esc)</button>
            </>
          )}

          {!placing && one && one.kind === "symbol" && (
            <>
              <span className="text-sm font-medium text-ink" data-testid="selected-title">{SYMBOLS[one.symbol].label}</span>
              <NumField label="Width" value={one.w} min={0.1} max={40} step={0.05} unit="m" onCommit={(v) => patch(one.id, { w: v })} testId="obj-w" />
              <NumField label="Length" value={one.l} min={0.1} max={40} step={0.05} unit="m" onCommit={(v) => patch(one.id, { l: v })} testId="obj-l" />
              <NumField label="Turn" value={one.rot} min={0} max={359.9} step={5} unit="°" onCommit={(v) => patch(one.id, { rot: v })} testId="obj-rot" />
              <button type="button" className={smallBtn} onClick={() => patch(one.id, { rot: (one.rot + 90) % 360 })} data-testid="obj-rot90">⟳ 90°</button>
            </>
          )}
          {!placing && one && one.kind === "label" && (
            <>
              <label className="flex items-center gap-1 text-xs text-slate">
                Text
                <input
                  type="text"
                  value={one.text}
                  maxLength={MAX_LABEL_CHARS}
                  data-testid="obj-text"
                  autoFocus={one.text === "Label"}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => patch(one.id, { text: e.target.value.slice(0, MAX_LABEL_CHARS) })}
                  onBlur={(e) => { const t = cleanLabelText(e.target.value); if (!t) onDelete(); else if (t !== one.text) patch(one.id, { text: t }); }}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 16 }}
                  className="w-44 rounded-lg border border-line px-2 py-1 text-ink"
                />
              </label>
              <NumField label="Size" value={one.size} min={6} max={40} step={1} unit="px" onCommit={(v) => patch(one.id, { size: Math.round(v) })} testId="obj-size" />
              <NumField label="Turn" value={one.rot} min={0} max={359.9} step={5} unit="°" onCommit={(v) => patch(one.id, { rot: v })} testId="obj-rot" />
            </>
          )}
          {!placing && one && one.kind === "wall" && (() => {
            const len = Math.hypot(one.x2 - one.x1, one.y2 - one.y1);
            return (
              <>
                <span className="text-sm font-medium text-ink" data-testid="selected-title">Wall</span>
                <NumField label="Thickness" value={one.t} min={0.02} max={1} step={0.025} unit="m" onCommit={(v) => patch(one.id, { t: v })} testId="obj-t" />
                <NumField
                  label="Length"
                  value={Math.round(len * 100) / 100}
                  min={0.1}
                  max={60}
                  step={0.05}
                  unit="m"
                  testId="obj-len"
                  onCommit={(v) => {
                    // Lengthen or shorten from the first end, keeping the wall pointing the same way.
                    const k = len > 0 ? v / len : 1;
                    patch(one.id, { x2: Math.max(0, one.x1 + (one.x2 - one.x1) * k), y2: Math.max(0, one.y1 + (one.y2 - one.y1) * k) });
                  }}
                />
              </>
            );
          })()}

          {!placing && selected.length > 1 && (
            <>
              <span className="text-sm font-medium text-ink" data-testid="selected-title">{selected.length} selected</span>
              <span className="text-xs text-slate">Align:</span>
              {([["left", "⇤ Left"], ["centre", "↔ Centre"], ["right", "⇥ Right"], ["top", "⤒ Top"], ["middle", "↕ Middle"], ["bottom", "⤓ Bottom"]] as [Align, string][]).map(([how, label]) => (
                <button key={how} type="button" className={smallBtn} onClick={() => onAlign(how)} data-align={how}>{label}</button>
              ))}
              <button type="button" className={smallBtn} disabled={selected.length < 3} onClick={() => onDistribute("horizontal")} title="Space three or more evenly" data-distribute="horizontal">⇹ Space across</button>
              <button type="button" className={smallBtn} disabled={selected.length < 3} onClick={() => onDistribute("vertical")} title="Space three or more evenly" data-distribute="vertical">⇳ Space down</button>
            </>
          )}

          {!placing && selected.length > 0 && (
            <>
              <button type="button" className={smallBtn} onClick={onDuplicate} disabled={full} data-testid="obj-duplicate">⧉ Duplicate</button>
              <button type="button" className={`${smallBtn} text-red-600`} onClick={onDelete} data-testid="obj-delete">🗑 Delete</button>
            </>
          )}
          {!placing && objects.length > 0 && selected.length === 0 && <span className="text-xs text-slate">Click an item to select it. Hold Shift to select several.</span>}
          {!placing && objects.length > 1 && <button type="button" className={smallBtn} onClick={onSelectAll} data-testid="obj-select-all">Select all ({objects.length})</button>}
          {full && <span className="text-xs text-red-600">Limit of {MAX_OBJECTS} items on a floor reached.</span>}
        </div>
      )}
    </>
  );
}
