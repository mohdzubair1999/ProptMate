"use client";

import React, { useRef } from "react";
import { type PlanObject, type SymbolObject, SYMBOLS, drawObject, objectBounds, objectCorners, moveObject } from "@/lib/floorPlanObjects";

// The furniture, free-standing walls and text labels drawn on top of the rooms - and everything you can do to them
// with a finger or mouse: select, drag, turn, resize, drag a wall's ends. It only DRAWS and reports changes; the
// editor owns the data (so undo, redo and saving work for objects exactly as they do for rooms).
//
// Everything that exists only for editing (outlines, handles, wide invisible click areas, the ghost shown while
// placing) is marked data-editor-only, so it never reaches an export, a saved snapshot or a report.

const PPM = 40; // pixels per metre - the editor's own scale
const ORIGIN = 10; // the margin the editor leaves round plan metre (0, 0)
const SIGNAL = "#D96B44";
const toM = (px: number) => (px - ORIGIN) / PPM;
const toPx = (m: number) => m * PPM + ORIGIN;
const snap = (v: number) => Math.round(v / 0.05) * 0.05;
const camel = (k: string) => k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

export type Placing = { type: "symbol"; symbol: SymbolObject["symbol"] } | { type: "label" } | { type: "wall" };

type Pt = { x: number; y: number };
type Drag =
  | { kind: "move"; start: Pt; ids: string[]; originals: PlanObject[]; primary: PlanObject; moved: boolean }
  | { kind: "rotate"; id: string; cx: number; cy: number }
  | { kind: "resize"; id: string; sx: 1 | -1; sy: 1 | -1; orig: SymbolObject }
  | { kind: "wall-end"; id: string; end: 1 | 2 };

function ObjectShape({ o }: { o: PlanObject }) {
  const d = drawObject(o, PPM, ORIGIN);
  return (
    <g transform={d.transform || undefined}>
      {d.prims.map((p, i) => React.createElement(p.t, { key: i, ...Object.fromEntries(Object.entries(p.a).map(([k, v]) => [camel(k), v])) }))}
      {d.text && (
        <text x={d.text.x} y={d.text.y} fontSize={d.text.size} fill="#25344A" textAnchor="middle" style={{ fontFamily: "inherit" }}>
          {d.text.value}
        </text>
      )}
    </g>
  );
}

export default function PlanObjectsLayer({
  objects,
  selectedIds,
  interactive,
  zoom,
  getPoint,
  onSelect,
  onUpdate,
  onDragStart,
  onDragEnd,
  placing,
  wallStart,
  cursor,
}: {
  objects: PlanObject[];
  selectedIds: string[];
  interactive: boolean; // false while measuring, drawing a room or placing something new
  zoom: number;
  getPoint: (e: React.PointerEvent) => Pt | null; // pointer position in the drawing's own pixels (zoom-safe)
  onSelect: (id: string, additive: boolean) => void;
  onUpdate: (updater: (objs: PlanObject[]) => PlanObject[]) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  placing: Placing | null;
  wallStart: Pt | null; // plan metres
  cursor: Pt | null; // plan metres
}) {
  const dragRef = useRef<Drag | null>(null);
  const s = Math.max(0.2, zoom); // handle sizes are kept a constant size ON SCREEN whatever the zoom
  const handleR = 8 / s;

  const begin = (e: React.PointerEvent, drag: Drag) => {
    e.stopPropagation();
    dragRef.current = drag;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    onDragStart();
  };

  const down = (e: React.PointerEvent, o: PlanObject) => {
    if (!interactive) return;
    e.stopPropagation();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const already = selectedIds.includes(o.id);
    if (additive) {
      onSelect(o.id, true);
      return; // shift-click only adds or removes it from the selection - it does not start a drag
    }
    if (!already) onSelect(o.id, false);
    const p = getPoint(e);
    if (!p) return;
    const ids = already ? selectedIds : [o.id];
    begin(e, { kind: "move", start: { x: toM(p.x), y: toM(p.y) }, ids, originals: objects.filter((x) => ids.includes(x.id)), primary: o, moved: false });
  };

  const move = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const p = getPoint(e);
    if (!p) return;
    const mx = toM(p.x), my = toM(p.y);

    if (d.kind === "move") {
      let dx = mx - d.start.x, dy = my - d.start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) * PPM * s < 3) return; // a click is not a nudge
        d.moved = true;
      }
      const ref = d.primary.kind === "wall" ? { x: d.primary.x1, y: d.primary.y1 } : { x: d.primary.x, y: d.primary.y };
      if (!e.altKey) {
        dx = snap(ref.x + dx) - ref.x;
        dy = snap(ref.y + dy) - ref.y;
      }
      const minX = Math.min(...d.originals.map((o) => objectBounds(o).minX));
      const minY = Math.min(...d.originals.map((o) => objectBounds(o).minY));
      dx = Math.max(dx, -minX);
      dy = Math.max(dy, -minY); // nothing is dragged off the top or left edge of the plan
      onUpdate((objs) => objs.map((o) => { const orig = d.originals.find((x) => x.id === o.id); return orig ? moveObject(orig, dx, dy) : o; }));
    } else if (d.kind === "rotate") {
      let rot = (Math.atan2(my - d.cy, mx - d.cx) * 180) / Math.PI + 90;
      rot = ((rot % 360) + 360) % 360;
      if (!e.shiftKey) rot = (Math.round(rot / 5) * 5) % 360; // 5 degree steps; hold Shift for free rotation
      onUpdate((objs) => objs.map((o) => (o.id === d.id && (o.kind === "symbol" || o.kind === "label") ? { ...o, rot } : o)));
    } else if (d.kind === "resize") {
      const th = (d.orig.rot * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
      const ddx = mx - d.orig.x, ddy = my - d.orig.y;
      const lx = ddx * c + ddy * sn, ly = -ddx * sn + ddy * c; // the pointer, in the object's own turned frame
      const fx = (-d.sx * d.orig.w) / 2, fy = (-d.sy * d.orig.l) / 2; // the opposite corner stays where it is
      let nw = Math.max(0.1, (lx - fx) * d.sx), nl = Math.max(0.1, (ly - fy) * d.sy);
      if (!e.altKey) { nw = Math.max(0.1, snap(nw)); nl = Math.max(0.1, snap(nl)); }
      nw = Math.min(40, nw); nl = Math.min(40, nl);
      const lcx = fx + (d.sx * nw) / 2, lcy = fy + (d.sy * nl) / 2;
      const nx = d.orig.x + lcx * c - lcy * sn, ny = d.orig.y + lcx * sn + lcy * c;
      const next = { ...d.orig, w: Math.round(nw * 1000) / 1000, l: Math.round(nl * 1000) / 1000, x: Math.round(nx * 1000) / 1000, y: Math.round(ny * 1000) / 1000 };
      if (objectBounds(next).minX < 0 || objectBounds(next).minY < 0) return;
      onUpdate((objs) => objs.map((o) => (o.id === d.id ? next : o)));
    } else if (d.kind === "wall-end") {
      onUpdate((objs) => objs.map((o) => {
        if (o.id !== d.id || o.kind !== "wall") return o;
        let x = Math.max(0, e.altKey ? mx : snap(mx)), y = Math.max(0, e.altKey ? my : snap(my));
        const fx = d.end === 1 ? o.x2 : o.x1, fy = d.end === 1 ? o.y2 : o.y1;
        if (!e.altKey) { if (Math.abs(x - fx) < 0.15) x = fx; if (Math.abs(y - fy) < 0.15) y = fy; } // soft snap to straight
        if (Math.hypot(x - fx, y - fy) < 0.05) return o;
        return d.end === 1 ? { ...o, x1: x, y1: y } : { ...o, x2: x, y2: y };
      }));
    }
  };

  const up = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    e.stopPropagation();
    dragRef.current = null;
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    onDragEnd();
  };

  const selected = objects.filter((o) => selectedIds.includes(o.id));
  const single = interactive && selected.length === 1 ? selected[0] : null;

  const outline = (o: PlanObject) => objectCorners(o, PPM).map(([x, y]) => `${toPx(x)},${toPx(y)}`).join(" ");
  const handleProps = (drag: Drag) => ({ onPointerDown: (e: React.PointerEvent) => begin(e, drag), onPointerMove: move, onPointerUp: up, onPointerCancel: up });

  return (
    <g data-plan-objects="true">
      {objects.map((o) => (
        <g
          key={o.id}
          data-object-id={o.id}
          data-object-kind={o.kind}
          style={{ pointerEvents: interactive ? "auto" : "none", cursor: interactive ? "move" : undefined, touchAction: interactive ? "none" : undefined }}
          onPointerDown={(e) => down(e, o)}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          <ObjectShape o={o} />
          {o.kind === "wall" && (
            // Thin walls are hard to catch with a finger: a wide invisible strip along them makes them easy to grab.
            <line data-editor-only="true" x1={toPx(o.x1)} y1={toPx(o.y1)} x2={toPx(o.x2)} y2={toPx(o.y2)} stroke="transparent" strokeWidth={Math.max(o.t * PPM, 16 / s)} />
          )}
          {o.kind === "label" && (
            <polygon data-editor-only="true" points={outline(o)} fill="transparent" />
          )}
        </g>
      ))}

      {interactive && selected.map((o) => (
        <polygon key={"sel-" + o.id} data-editor-only="true" data-selection-for={o.id} points={outline(o)} fill="none" stroke={SIGNAL} strokeWidth={1.5 / s} strokeDasharray={`${5 / s} ${3 / s}`} pointerEvents="none" />
      ))}

      {single && single.kind === "wall" && (
        <>
          <circle data-editor-only="true" data-handle="wall-end-1" cx={toPx(single.x1)} cy={toPx(single.y1)} r={handleR} fill="#fff" stroke={SIGNAL} strokeWidth={2 / s} style={{ cursor: "grab", touchAction: "none" }} {...handleProps({ kind: "wall-end", id: single.id, end: 1 })} />
          <circle data-editor-only="true" data-handle="wall-end-2" cx={toPx(single.x2)} cy={toPx(single.y2)} r={handleR} fill="#fff" stroke={SIGNAL} strokeWidth={2 / s} style={{ cursor: "grab", touchAction: "none" }} {...handleProps({ kind: "wall-end", id: single.id, end: 2 })} />
        </>
      )}

      {single && (single.kind === "symbol" || single.kind === "label") && (() => {
        const b = objectCorners(single, PPM);
        const top = { x: (b[0][0] + b[1][0]) / 2, y: (b[0][1] + b[1][1]) / 2 }; // the middle of the object's top edge
        const cx = single.x, cy = single.y;
        const len = Math.hypot(top.x - cx, top.y - cy) || 0.1;
        const gap = 30 / (s * PPM); // the turn handle sits a fixed distance on screen above the object
        const hx = cx + ((top.x - cx) / len) * (len + gap), hy = cy + ((top.y - cy) / len) * (len + gap);
        return (
          <>
            <line data-editor-only="true" x1={toPx(top.x)} y1={toPx(top.y)} x2={toPx(hx)} y2={toPx(hy)} stroke={SIGNAL} strokeWidth={1.5 / s} pointerEvents="none" />
            <circle data-editor-only="true" data-handle="rotate" cx={toPx(hx)} cy={toPx(hy)} r={handleR} fill="#fff" stroke={SIGNAL} strokeWidth={2 / s} style={{ cursor: "grab", touchAction: "none" }} {...handleProps({ kind: "rotate", id: single.id, cx, cy })} />
            {single.kind === "symbol" && ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sy], i) => {
              const th = (single.rot * Math.PI) / 180;
              const lx = (sx * single.w) / 2, ly = (sy * single.l) / 2;
              const px = single.x + lx * Math.cos(th) - ly * Math.sin(th), py = single.y + lx * Math.sin(th) + ly * Math.cos(th);
              return <rect key={i} data-editor-only="true" data-handle={`resize-${i}`} x={toPx(px) - handleR * 0.75} y={toPx(py) - handleR * 0.75} width={handleR * 1.5} height={handleR * 1.5} fill="#fff" stroke={SIGNAL} strokeWidth={2 / s} style={{ cursor: "nwse-resize", touchAction: "none" }} {...handleProps({ kind: "resize", id: single.id, sx, sy, orig: single })} />;
            })}
          </>
        );
      })()}

      {placing && cursor && (
        <g data-editor-only="true" pointerEvents="none" opacity={0.6}>
          {placing.type === "symbol" && (
            <ObjectShape o={{ id: "ghost", kind: "symbol", symbol: placing.symbol, x: cursor.x, y: cursor.y, w: SYMBOLS[placing.symbol].w, l: SYMBOLS[placing.symbol].l, rot: 0 }} />
          )}
          {placing.type === "label" && <ObjectShape o={{ id: "ghost", kind: "label", x: cursor.x, y: cursor.y, text: "Label", size: 12, rot: 0 }} />}
          {placing.type === "wall" && wallStart && (
            <>
              <line x1={toPx(wallStart.x)} y1={toPx(wallStart.y)} x2={toPx(cursor.x)} y2={toPx(cursor.y)} stroke="#25344A" strokeWidth={4} strokeDasharray="6 4" />
              <text x={(toPx(wallStart.x) + toPx(cursor.x)) / 2} y={(toPx(wallStart.y) + toPx(cursor.y)) / 2 - 8} textAnchor="middle" fontSize={11} fill="#25344A">
                {Math.hypot(cursor.x - wallStart.x, cursor.y - wallStart.y).toFixed(2)}m
              </text>
            </>
          )}
          {placing.type === "wall" && <circle cx={toPx(wallStart ? wallStart.x : cursor.x)} cy={toPx(wallStart ? wallStart.y : cursor.y)} r={4} fill={SIGNAL} />}
        </g>
      )}
    </g>
  );
}
