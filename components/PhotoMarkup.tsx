"use client";

import { useEffect, useRef, useState } from "react";
import { COLOURS, MAX_SHAPES, THICKNESS, markupInnerSvg, shapeFromDrag, type Colour, type Shape, type Thickness } from "@/lib/photoMarkup";

type Tool = "circle" | "box" | "arrow";
const TOOLS: { id: Tool; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "box", label: "Box" },
  { id: "arrow", label: "Arrow" },
];
const COLOUR_NAMES: Record<Colour, string> = { red: "Red", yellow: "Yellow", blue: "Blue", white: "White" };

// Draw circles, boxes and arrows over a photo, then save a MARKED-UP COPY. The original photo is never changed. The drawing is made by the same code the
// server uses for the saved copy, so what you see here is what is saved.
export default function PhotoMarkup({ photo, onClose, onSaved }: { photo: { id: string; url: string }; onClose: () => void; onSaved: () => void }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [tool, setTool] = useState<Tool>("circle");
  const [colour, setColour] = useState<Colour>("red");
  const [thickness, setThickness] = useState<Thickness>("normal");
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlay = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  // where on the photo (0 to 1 across and down) a pointer is
  const at = (e: React.PointerEvent) => {
    const r = overlay.current!.getBoundingClientRect();
    return { x: r.width ? (e.clientX - r.left) / r.width : 0, y: r.height ? (e.clientY - r.top) / r.height : 0 };
  };
  const down = (e: React.PointerEvent) => {
    if (busy || !size) return;
    if (shapes.length >= MAX_SHAPES) { setError(`That is the most marks (${MAX_SHAPES}). Undo one to add another.`); return; }
    setError(null);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const p = at(e);
    setDrag({ a: p, b: p });
  };
  const move = (e: React.PointerEvent) => { if (drag) setDrag({ a: drag.a, b: at(e) }); };
  const up = (e: React.PointerEvent) => {
    if (!drag) return;
    const s = shapeFromDrag(tool, drag.a, at(e), { colour, thickness });
    setDrag(null);
    if (s) setShapes((prev) => [...prev, s]);
  };

  const preview = drag ? shapeFromDrag(tool, drag.a, drag.b, { colour, thickness }) : null;
  const inner = size ? markupInnerSvg(preview ? [...shapes, preview] : shapes, size.w, size.h) : "";

  const save = async () => {
    if (busy || shapes.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/photos/markup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId: photo.id, shapes }) });
      if (!res.ok) {
        let message = "Couldn't save the marked-up photo - please try again.";
        try { const j = await res.json(); if (j?.error) message = String(j.error); } catch { /* keep the general message */ }
        setError(message);
        return;
      }
      onSaved();
    } catch {
      setError("Couldn't save the marked-up photo - check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const btn = "text-sm rounded-full px-3 py-1.5 border";
  return (
    <div role="dialog" aria-modal="true" aria-label="Mark up photo" data-testid="markup-dialog" className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center p-3 overflow-auto">
      <div className="w-full max-w-3xl bg-white rounded-xl p-3 mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Tool" className="flex gap-1">
            {TOOLS.map((t) => (
              <button key={t.id} type="button" onClick={() => setTool(t.id)} aria-pressed={tool === t.id} data-testid={`tool-${t.id}`} className={`${btn} ${tool === t.id ? "bg-ink text-white border-ink" : "border-line text-ink"}`}>{t.label}</button>
            ))}
          </div>
          <div role="group" aria-label="Colour" className="flex gap-1.5 items-center">
            {(Object.keys(COLOURS) as Colour[]).map((c) => (
              <button key={c} type="button" onClick={() => setColour(c)} aria-pressed={colour === c} aria-label={COLOUR_NAMES[c]} data-testid={`colour-${c}`} style={{ background: COLOURS[c] }} className={`w-7 h-7 rounded-full border ${colour === c ? "ring-2 ring-ink ring-offset-1" : "border-line"}`} />
            ))}
          </div>
          <select value={thickness} onChange={(e) => setThickness(e.target.value as Thickness)} aria-label="Line thickness" data-testid="thickness" className="rounded-lg border border-line px-2 py-1 text-sm bg-white">
            <option value="thin">Thin line</option>
            <option value="normal">Normal line</option>
            <option value="thick">Thick line</option>
          </select>
          <button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={shapes.length === 0 || busy} data-testid="undo" className={`${btn} border-line text-ink disabled:opacity-40`}>Undo</button>
          <button type="button" onClick={() => setShapes([])} disabled={shapes.length === 0 || busy} data-testid="clear" className={`${btn} border-line text-ink disabled:opacity-40`}>Clear</button>
        </div>
        <p className="text-xs text-slate mt-2">Drag on the photo to draw. This saves a marked-up <strong>copy</strong> as a new photo; the original is kept as it is.</p>

        <div className="mt-2 flex justify-center bg-paper rounded-lg overflow-hidden">
          <div className="relative inline-block max-w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" onLoad={(e) => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} draggable={false} className="block max-w-full max-h-[65vh] w-auto h-auto select-none" data-testid="markup-image" />
            {size && (
              <svg ref={overlay} viewBox={`0 0 ${size.w} ${size.h}`} className="absolute inset-0 w-full h-full cursor-crosshair" style={{ touchAction: "none" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setDrag(null)} data-testid="markup-overlay">
                <g dangerouslySetInnerHTML={{ __html: inner }} data-testid="markup-marks" data-count={shapes.length} />
              </svg>
            )}
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-red-700 mt-2" data-testid="markup-error">{error}</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs text-slate" data-testid="markup-count">{shapes.length === 0 ? "No marks yet" : `${shapes.length} mark${shapes.length === 1 ? "" : "s"}`}</span>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} data-testid="markup-cancel" className={`${btn} border-line text-ink disabled:opacity-40`}>Cancel</button>
            <button type="button" onClick={save} disabled={busy || shapes.length === 0} data-testid="markup-save" className={`${btn} bg-signal text-white border-signal disabled:opacity-40`}>{busy ? "Saving…" : "Save marked-up copy"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
