// Marking up a photo: circles, boxes and arrows drawn over it, to point at a mark, a crack or a stain. The marks are saved as a NEW photo (a copy
// with the marks drawn on), never over the original. This file is shared by the screen (to draw what you are drawing) and the server (to draw the
// saved copy), so both draw exactly the same thing. Everything here is plain numbers and a fixed palette: no text ever reaches the drawing.

export const MAX_SHAPES = 30;
export const COLOURS = { red: "#e11d48", yellow: "#f59e0b", blue: "#2563eb", white: "#ffffff" } as const;
// line thickness as a fraction of the SHORTER side of the photo, so it looks the same on a small photo and a large one
export const THICKNESS = { thin: 0.004, normal: 0.007, thick: 0.012 } as const;
export type Colour = keyof typeof COLOURS;
export type Thickness = keyof typeof THICKNESS;
type Look = { colour: Colour; thickness: Thickness };
// all positions are fractions of the photo's width and height, from 0 to 1
export type Shape =
  | ({ type: "circle"; cx: number; cy: number; rx: number; ry: number } & Look)
  | ({ type: "box"; x: number; y: number; w: number; h: number } & Look)
  | ({ type: "arrow"; x1: number; y1: number; x2: number; y2: number } & Look);

export const MIN_SIZE = 0.01; // a box or circle smaller than 1% of the photo is a stray tap, not a mark
export const MIN_ARROW = 0.02;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const unit = (v: unknown): number | null => { const n = num(v); return n === null || n < -0.05 || n > 1.05 ? null : Math.min(1, Math.max(0, n)); };

export type ParsedShapes = { ok: true; shapes: Shape[] } | { ok: false; error: string };
// Checks marks sent by a screen (or anyone). Strict: anything unexpected is refused with a plain reason rather than quietly changed.
export function parseShapes(input: unknown): ParsedShapes {
  if (!Array.isArray(input)) return { ok: false, error: "The marks must be a list" };
  if (input.length === 0) return { ok: false, error: "Draw at least one mark first" };
  if (input.length > MAX_SHAPES) return { ok: false, error: `Too many marks (the most is ${MAX_SHAPES})` };
  const out: Shape[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "A mark is not valid" };
    const o = raw as Record<string, unknown>;
    const colour = typeof o.colour === "string" && Object.prototype.hasOwnProperty.call(COLOURS, o.colour) ? (o.colour as Colour) : null;
    const thickness = typeof o.thickness === "string" && Object.prototype.hasOwnProperty.call(THICKNESS, o.thickness) ? (o.thickness as Thickness) : null;
    if (!colour || !thickness) return { ok: false, error: "A mark has a colour or thickness that is not allowed" };
    if (o.type === "circle") {
      const cx = unit(o.cx), cy = unit(o.cy), rx = num(o.rx), ry = num(o.ry);
      if (cx === null || cy === null || rx === null || ry === null || rx < MIN_SIZE / 2 || ry < MIN_SIZE / 2 || rx > 0.6 || ry > 0.6) return { ok: false, error: "A circle is not valid" };
      out.push({ type: "circle", cx, cy, rx, ry, colour, thickness });
    } else if (o.type === "box") {
      const x = unit(o.x), y = unit(o.y), w = num(o.w), h = num(o.h);
      if (x === null || y === null || w === null || h === null || w < MIN_SIZE || h < MIN_SIZE || w > 1.1 || h > 1.1) return { ok: false, error: "A box is not valid" };
      out.push({ type: "box", x, y, w, h, colour, thickness });
    } else if (o.type === "arrow") {
      const x1 = unit(o.x1), y1 = unit(o.y1), x2 = unit(o.x2), y2 = unit(o.y2);
      if (x1 === null || y1 === null || x2 === null || y2 === null || Math.hypot(x2 - x1, y2 - y1) < MIN_ARROW) return { ok: false, error: "An arrow is not valid" };
      out.push({ type: "arrow", x1, y1, x2, y2, colour, thickness });
    } else return { ok: false, error: "A mark is not a circle, box or arrow" };
  }
  return { ok: true, shapes: out };
}

const n = (v: number) => Number(v.toFixed(2));

// The drawing for the given marks on a photo of width x height pixels, as SVG inner markup. Each mark is drawn with a thin dark edge underneath, so
// it can be seen on a light or a dark photo. Only numbers from the checks above and palette colours are used.
// (Math.max(1, NaN) is NaN, so a size that is not a real number has to be handled before it)
const dim = (v: number) => (Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1);

export function markupInnerSvg(shapes: Shape[], width: number, height: number): string {
  const W = dim(width), H = dim(height), m = Math.min(W, H);
  const parts: string[] = [];
  for (const s of shapes) {
    const sw = n(Math.max(1.5, THICKNESS[s.thickness] * m)), colour = COLOURS[s.colour], halo = n(sw * 2.2);
    const draw = (tag: string, attrs: string, fill = "none") => {
      parts.push(`<${tag} ${attrs} fill="none" stroke="#000000" stroke-opacity="0.45" stroke-width="${halo}" stroke-linejoin="round" stroke-linecap="round"/>`);
      parts.push(`<${tag} ${attrs} fill="${fill}" stroke="${colour}" stroke-width="${sw}" stroke-linejoin="round" stroke-linecap="round"/>`);
    };
    if (s.type === "circle") draw("ellipse", `cx="${n(s.cx * W)}" cy="${n(s.cy * H)}" rx="${n(s.rx * W)}" ry="${n(s.ry * H)}"`);
    else if (s.type === "box") draw("rect", `x="${n(s.x * W)}" y="${n(s.y * H)}" width="${n(s.w * W)}" height="${n(s.h * H)}"`);
    else {
      const x1 = s.x1 * W, y1 = s.y1 * H, x2 = s.x2 * W, y2 = s.y2 * H;
      const ang = Math.atan2(y2 - y1, x2 - x1), head = Math.max(sw * 4.5, 0.035 * m), spread = Math.PI / 7;
      // the line stops at the base of the head so the point is sharp
      const bx = x2 - Math.cos(ang) * head * 0.8, by = y2 - Math.sin(ang) * head * 0.8;
      const pts = `${n(x2)},${n(y2)} ${n(x2 - head * Math.cos(ang - spread))},${n(y2 - head * Math.sin(ang - spread))} ${n(x2 - head * Math.cos(ang + spread))},${n(y2 - head * Math.sin(ang + spread))}`;
      draw("line", `x1="${n(x1)}" y1="${n(y1)}" x2="${n(bx)}" y2="${n(by)}"`);
      draw("polygon", `points="${pts}"`, colour);
    }
  }
  return parts.join("");
}

export const markupSvg = (shapes: Shape[], width: number, height: number): string => {
  const W = dim(width), H = dim(height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${markupInnerSvg(shapes, W, H)}</svg>`;
};

// The shape for a drag from one point to another (fractions of the photo), or null if it is too small to be a mark
export function shapeFromDrag(tool: "circle" | "box" | "arrow", a: { x: number; y: number }, b: { x: number; y: number }, look: Look): Shape | null {
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  const x1 = cl(a.x), y1 = cl(a.y), x2 = cl(b.x), y2 = cl(b.y);
  if (tool === "arrow") return Math.hypot(x2 - x1, y2 - y1) < MIN_ARROW ? null : { type: "arrow", x1, y1, x2, y2, ...look };
  const x = Math.min(x1, x2), y = Math.min(y1, y2), w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
  if (w < MIN_SIZE || h < MIN_SIZE) return null;
  return tool === "box" ? { type: "box", x, y, w, h, ...look } : { type: "circle", cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, ...look };
}
