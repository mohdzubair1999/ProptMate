"use client";

import { dimText } from "@/lib/floorPlanObjects";
import React, { useEffect, useRef, useState } from "react";
import { type PlanObject, type Align, SYMBOLS, SYMBOL_GROUPS, SYMBOL_KINDS, type SymbolGroup, MAX_OBJECTS, MAX_LABEL_CHARS, cleanLabelText, drawObject, isPin, nextPinNumber, objectBounds } from "@/lib/floorPlanObjects";
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

// Put the selection on a layer of your own: a name (choose one you have, or type a new one), or back on its usual layer
function LayerControl({ names, onAssign }: { names: string[]; onAssign: (name: string | null) => void }) {
  const [text, setText] = useState("");
  const go = () => { const t = text.trim(); if (t) { onAssign(t); setText(""); } };
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate" data-testid="layer-control">
      🗂
      <input list="plan-layer-names" aria-label="Layer name" title="Put the selected items on a layer of your own" placeholder="Layer…" value={text} data-testid="layer-name" className="w-28 border border-line rounded px-1.5 py-0.5 text-xs text-ink bg-white" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") go(); }} />
      <datalist id="plan-layer-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      <button type="button" className={smallBtn} onClick={go} data-testid="layer-assign">Put on layer</button>
      <button type="button" className={smallBtn} onClick={() => onAssign(null)} title="Back on their usual layers" data-testid="layer-clear">Usual layer</button>
    </span>
  );
}

// Bring in a DXF drawing: lines and polylines become walls, text becomes labels. The units are read from the file, or guessed from the drawing's size, or chosen here.
function DxfImport({ onImport, disabled, pillClass }: { onImport: (file: File, unit: "auto" | "mm" | "cm" | "m") => void; disabled: boolean; pillClass: string }) {
  const [unit, setUnit] = useState<"auto" | "mm" | "cm" | "m">("auto");
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" disabled={disabled} className={pillClass} onClick={() => ref.current?.click()} title="Bring in the lines and text of a DXF drawing as walls and labels" data-testid="dxf-import-button">⤓ Import DXF</button>
      <select aria-label="Units of the drawing" title="Units of the drawing" value={unit} onChange={(e) => setUnit(e.target.value as typeof unit)} className="border border-line rounded px-1 py-0.5 text-xs text-ink bg-white" data-testid="dxf-unit">
        <option value="auto">units: automatic</option>
        <option value="mm">millimetres</option>
        <option value="cm">centimetres</option>
        <option value="m">metres</option>
      </select>
      <input ref={ref} type="file" accept=".dxf,text/plain,application/dxf,image/vnd.dxf" className="hidden" data-testid="dxf-file" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImport(f, unit); }} />
    </span>
  );
}

// Copies in a row: how many, and how far apart across and down
function ArrayControls({ onArray, disabled }: { onArray: (count: number, dx: number, dy: number) => void; disabled: boolean }) {
  const [count, setCount] = useState("3"), [dx, setDx] = useState("1"), [dy, setDy] = useState("0");
  const go = () => onArray(parseInt(count, 10), parseFloat(dx), parseFloat(dy));
  const box = "w-14 border border-line rounded px-1.5 py-0.5 text-xs text-ink bg-white";
  const field = (label: string, value: string, set: (v: string) => void, testId: string) => (
    <input type="number" inputMode="decimal" aria-label={label} title={label} value={value} data-testid={testId} className={box} onChange={(e) => set(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") go(); }} />
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-slate" data-testid="array-controls">
      ⧉ ×{field("How many copies", count, setCount, "array-count")} every {field("Metres across for each copy", dx, setDx, "array-dx")} across {field("Metres down for each copy", dy, setDy, "array-dy")} m down
      <button type="button" className={smallBtn} onClick={go} disabled={disabled} data-testid="array-make">Make copies</button>
    </span>
  );
}

export default function PlanObjectsToolbar({
  placing,
  setPlacing,
  wallStart,
  wallStatus,
  dimStage,
  onMirror,
  onArray,
  roomBox,
  onDimensionRoom,
  onTrimExtend,
  onCorner,
  onImportDxf,
  layerNames,
  onAssignLayer,
  toolNote,
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
  wallStatus?: string; // the live readout while drawing a wall or placing a dimension
  dimStage?: 0 | 1 | 2; // which click of the dimension tool is next: the first point, the second point, or how far out the line sits
  onMirror?: (axis: "vertical" | "horizontal") => void;
  onArray?: (count: number, dx: number, dy: number) => void;
  roomBox?: { x: number; y: number; w: number; h: number } | null; // the selected room's overall box (when one is selected)
  onDimensionRoom?: () => void;
  onTrimExtend?: (end: 1 | 2) => void; // make an end of the selected wall meet the line it crosses or the next line it points at
  onCorner?: () => void; // join two selected walls at their corner
  onImportDxf?: (file: File, unit: "auto" | "mm" | "cm" | "m") => void; // bring in lines and text from a DXF drawing
  layerNames?: string[]; // the layers of the person's own on this floor
  onAssignLayer?: (name: string | null) => void; // put the selection on a layer (a name), or back on its usual layer (null)
  toolNote?: string; // a short result or reason from the mirror, copies and room dimension buttons
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
    if (placing.type === "pin") return `Click the plan to place pin ${nextPinNumber(objects) ?? ""}, then describe the defect`;
    if (placing.type === "dim") return dimStage === 2 ? "Move to set how far out the dimension line sits, then click" : dimStage === 1 ? "Click the second point" : "Click the first point - it snaps to corners, ends and middles";
    return wallStart ? "Click where the wall ends, or type a length and press Enter - keep going to continue it" : "Click where the wall starts - it snaps to corners, ends and middles";
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
      <button type="button" disabled={full || nextPinNumber(objects) === null} onClick={() => { setPickerOpen(false); setPlacing(placing?.type === "pin" ? null : { type: "pin" }); }} title="Mark a defect: it gets a number on the plan, and your note is listed under the plan in the printed key" className={pill(placing?.type === "pin")} data-testid="pin-button">
        📍 Pin
      </button>
      <button type="button" disabled={full} onClick={() => { setPickerOpen(false); setPlacing(placing?.type === "wall" ? null : { type: "wall" }); }} title="Add a free-standing wall or partition" className={pill(placing?.type === "wall")} data-testid="wall-button">
        ▬ Wall
      </button>
      <button type="button" disabled={full} onClick={() => { setPickerOpen(false); setPlacing(placing?.type === "dim" ? null : { type: "dim" }); }} title="Measure between two points and leave the dimension on the plan" className={pill(placing?.type === "dim")} data-testid="dim-button">
        ↔ Dimension
      </button>
      {!placing && roomBox && onDimensionRoom && (
        <button type="button" disabled={full} onClick={onDimensionRoom} title="Add the room's overall width and length as dimensions" className={pill(false)} data-testid="dim-room-button">
          ↔ Dimension room
        </button>
      )}
      {!placing && onImportDxf && <DxfImport onImport={onImportDxf} disabled={full} pillClass={pill(false)} />}
      {!placing && toolNote && <span className="text-xs text-slate" data-testid="tool-note">{toolNote}</span>}

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
          {(placing?.type === "wall" || placing?.type === "dim") && wallStatus && <p className="w-full text-xs text-slate" style={{ fontFamily: "ui-monospace, monospace" }} data-testid="wall-status">{wallStatus}</p>}

          {!placing && one && one.kind === "symbol" && (
            <>
              <span className="text-sm font-medium text-ink" data-testid="selected-title">{SYMBOLS[one.symbol].label}</span>
              <NumField label="Width" value={one.w} min={0.1} max={40} step={0.05} unit="m" onCommit={(v) => patch(one.id, { w: v })} testId="obj-w" />
              <NumField label="Length" value={one.l} min={0.1} max={40} step={0.05} unit="m" onCommit={(v) => patch(one.id, { l: v })} testId="obj-l" />
              <NumField label="Turn" value={one.rot} min={0} max={359.9} step={5} unit="°" onCommit={(v) => patch(one.id, { rot: v })} testId="obj-rot" />
              <button type="button" className={smallBtn} onClick={() => patch(one.id, { rot: (one.rot + 90) % 360 })} data-testid="obj-rot90">⟳ 90°</button>
            </>
          )}
          {!placing && one && one.kind === "label" && isPin(one) && (
            <>
              <span className="text-sm font-medium text-ink" data-testid="selected-title">Pin {one.pin}</span>
              <label className="flex items-center gap-1 text-xs text-slate">
                Note
                <input
                  type="text"
                  value={one.text}
                  maxLength={MAX_LABEL_CHARS}
                  data-testid="obj-text"
                  autoFocus={one.text === "Describe the defect"}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => patch(one.id, { text: e.target.value.slice(0, MAX_LABEL_CHARS) })}
                  onBlur={(e) => { const t = cleanLabelText(e.target.value); if (!t) onDelete(); else if (t !== one.text) patch(one.id, { text: t }); }}
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  style={{ fontSize: 16 }}
                  className="w-56 rounded-lg border border-line px-2 py-1 text-ink"
                />
              </label>
              <span className="text-xs text-slate">The note is listed in the key under the plan.</span>
            </>
          )}
          {!placing && one && one.kind === "label" && !isPin(one) && (
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

          {!placing && one && one.kind === "dim" && (
            <>
              <span className="text-sm font-medium text-ink" data-testid="selected-title">Dimension {dimText(one)}</span>
              <NumField label="Offset" value={one.off} min={-10} max={10} step={0.05} unit="m" onCommit={(v) => patch(one.id, { off: v })} testId="obj-off" />
              <button type="button" onClick={() => patch(one.id, { off: -one.off })} className={smallBtn} data-testid="dim-flip">Flip side</button>
            </>
          )}

          {!placing && one && one.kind === "wall" && onTrimExtend && (
            <>
              <button type="button" className={smallBtn} onClick={() => onTrimExtend(1)} title="Make the start of this wall meet the line it crosses, or reach the next line it points at" data-testid="trimext-1">⇤ Trim/extend start</button>
              <button type="button" className={smallBtn} onClick={() => onTrimExtend(2)} title="Make the end of this wall meet the line it crosses, or reach the next line it points at" data-testid="trimext-2">⇥ Trim/extend end</button>
            </>
          )}
          {!placing && selected.length === 2 && selected.every((o) => o.kind === "wall") && onCorner && (
            <button type="button" className={smallBtn} onClick={onCorner} title="Join the two walls at their corner" data-testid="walls-corner">⌐ Corner</button>
          )}

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
              {onMirror && <button type="button" className={smallBtn} onClick={() => onMirror("vertical")} title="Flip left to right, in place" data-testid="obj-mirror-v">⇆ Mirror</button>}
              {onMirror && <button type="button" className={smallBtn} onClick={() => onMirror("horizontal")} title="Flip top to bottom, in place" data-testid="obj-mirror-h">⇅ Flip</button>}
              {onArray && <ArrayControls onArray={onArray} disabled={full} />}
              {onAssignLayer && <LayerControl names={layerNames ?? []} onAssign={onAssignLayer} />}
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
