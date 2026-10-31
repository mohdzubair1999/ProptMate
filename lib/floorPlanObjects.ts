// Things a person places on a floor plan besides rooms: furniture and fittings (symbols), free-standing walls and
// text labels. Pure data and arithmetic - no browser, no React - so every rule here is tested directly.
//
// Objects are stored per floor as JSON, and that JSON is UNTRUSTED when it comes back (it crossed the network and the
// database), so cleanObjects() rebuilds every object from scratch, keeping only what is valid and in range.
//
// Symbols are described as plain shapes (lines, rectangles, circles...) rather than markup strings, so the editor can
// draw them as real React elements - nothing is ever injected as HTML - and the plan sheet can turn the very same
// shapes into SVG text.

export const MAX_OBJECTS = 400;
export const MAX_LABEL_CHARS = 80;
const MAX_COORD = 200; // metres - the plan is a few tens of metres across at most
const MIN_SIZE = 0.05;
const MAX_SIZE = 40;

export const STROKE = "#8B7355"; // the same brown the editor's built-in fixtures use
const INK = "#25344A";

export type Prim = { t: "line" | "rect" | "circle" | "ellipse" | "path" | "polygon" | "polyline"; a: Record<string, number | string> };

// ---- the symbol catalogue ----------------------------------------------------------------------------------------
export type SymbolGroup = "Bedroom" | "Living" | "Kitchen" | "Bathroom" | "Other";

type SymbolDef = { label: string; group: SymbolGroup; w: number; l: number; draw: (w: number, l: number) => Prim[] };

const base = { stroke: STROKE, "stroke-width": 1.5, fill: "none" } as const;
const R = (x: number, y: number, w: number, h: number, extra: Record<string, number | string> = {}): Prim => ({ t: "rect", a: { x, y, width: Math.max(0, w), height: Math.max(0, h), ...base, ...extra } });
const C = (cx: number, cy: number, r: number, extra: Record<string, number | string> = {}): Prim => ({ t: "circle", a: { cx, cy, r: Math.max(0, r), ...base, ...extra } });
const E = (cx: number, cy: number, rx: number, ry: number, extra: Record<string, number | string> = {}): Prim => ({ t: "ellipse", a: { cx, cy, rx: Math.max(0, rx), ry: Math.max(0, ry), ...base, ...extra } });
const L = (x1: number, y1: number, x2: number, y2: number, extra: Record<string, number | string> = {}): Prim => ({ t: "line", a: { x1, y1, x2, y2, ...base, ...extra } });
const P = (d: string, extra: Record<string, number | string> = {}): Prim => ({ t: "path", a: { d, ...base, ...extra } });
const WHITE = { fill: "#FFFFFF" };
const round = (n: number) => Math.round(n * 100) / 100;

// A bed: frame, pillows at the head, and the fold line of the duvet.
const bed = (pillows: number) => (w: number, l: number): Prim[] => {
  // Insets scale with the symbol (up to their usual size) so a tiny bed still stays inside its own box.
  const m = Math.min(6, w * 0.08, l * 0.08);
  const gap = Math.min(4, w * 0.05);
  const pw = Math.max(0, (w - 2 * m - gap * (pillows - 1)) / pillows);
  const out: Prim[] = [R(0, 0, w, l, WHITE)];
  for (let i = 0; i < pillows; i++) out.push(R(m + i * (pw + gap), m, pw, Math.min(l * 0.18, 22), { "stroke-width": 1 }));
  out.push(L(0, l * 0.32, w, l * 0.32, { "stroke-width": 1 }));
  return out;
};
const sofa = (seats: number) => (w: number, l: number): Prim[] => {
  const arm = Math.min(w * 0.1, 8), back = l * 0.28;
  const out: Prim[] = [R(0, 0, w, l, WHITE), R(0, 0, w, back), R(0, back, arm, l - back), R(w - arm, back, arm, l - back)];
  for (let i = 1; i < seats; i++) out.push(L(arm + ((w - 2 * arm) * i) / seats, back, arm + ((w - 2 * arm) * i) / seats, l, { "stroke-width": 1 }));
  return out;
};
const cross = (w: number, l: number): Prim[] => [R(0, 0, w, l, WHITE), L(0, 0, w, l, { "stroke-width": 1 }), L(w, 0, 0, l, { "stroke-width": 1 })];
const plain = (w: number, l: number): Prim[] => [R(0, 0, w, l, WHITE)];
const rings = (w: number, l: number): Prim[] => {
  const r = Math.min(w, l) * 0.17;
  return [R(0, 0, w, l, WHITE), C(w * 0.3, l * 0.3, r), C(w * 0.7, l * 0.3, r), C(w * 0.3, l * 0.7, r), C(w * 0.7, l * 0.7, r)];
};

export const SYMBOLS = {
  "bed-single": { label: "Single bed", group: "Bedroom", w: 0.9, l: 2.0, draw: bed(1) },
  "bed-double": { label: "Double bed", group: "Bedroom", w: 1.4, l: 2.0, draw: bed(2) },
  "bed-king": { label: "King bed", group: "Bedroom", w: 1.6, l: 2.0, draw: bed(2) },
  "bunk-bed": { label: "Bunk bed", group: "Bedroom", w: 0.95, l: 2.0, draw: (w: number, l: number) => { const i = Math.min(3, w * 0.06, l * 0.06); return [...bed(1)(w, l), R(i, i, w - 2 * i, l - 2 * i, { "stroke-dasharray": "4 3", "stroke-width": 1 })]; } },
  wardrobe: { label: "Wardrobe", group: "Bedroom", w: 1.2, l: 0.6, draw: cross },
  "chest-of-drawers": { label: "Chest of drawers", group: "Bedroom", w: 0.9, l: 0.45, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), L(0, l / 2, w, l / 2, { "stroke-width": 1 })] },
  "bedside-table": { label: "Bedside table", group: "Bedroom", w: 0.45, l: 0.4, draw: plain },
  "dressing-table": { label: "Dressing table", group: "Bedroom", w: 1.1, l: 0.5, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), C(w / 2, l / 2, Math.min(w, l) * 0.18, { "stroke-width": 1 })] },
  "sofa-2": { label: "2-seater sofa", group: "Living", w: 1.6, l: 0.9, draw: sofa(2) },
  "sofa-3": { label: "3-seater sofa", group: "Living", w: 2.1, l: 0.9, draw: sofa(3) },
  armchair: { label: "Armchair", group: "Living", w: 0.9, l: 0.9, draw: sofa(1) },
  "coffee-table": { label: "Coffee table", group: "Living", w: 1.0, l: 0.55, draw: plain },
  "tv-unit": { label: "TV unit", group: "Living", w: 1.4, l: 0.4, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), R(w * 0.3, l * 0.2, w * 0.4, l * 0.6, { "stroke-width": 1 })] },
  bookcase: { label: "Bookcase", group: "Living", w: 0.9, l: 0.3, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), L(w / 3, 0, w / 3, l, { "stroke-width": 1 }), L((w * 2) / 3, 0, (w * 2) / 3, l, { "stroke-width": 1 })] },
  fireplace: { label: "Fireplace", group: "Living", w: 1.2, l: 0.4, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), R(w * 0.2, l * 0.25, w * 0.6, l * 0.75, { "stroke-width": 1 })] },
  "dining-table": { label: "Dining table (rect)", group: "Kitchen", w: 1.6, l: 0.9, draw: plain },
  "round-table": { label: "Round table", group: "Kitchen", w: 1.0, l: 1.0, draw: (w: number, l: number) => [E(w / 2, l / 2, w / 2, l / 2, WHITE)] },
  chair: { label: "Chair", group: "Kitchen", w: 0.45, l: 0.45, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), L(0, l * 0.2, w, l * 0.2, { "stroke-width": 1 })] },
  desk: { label: "Desk", group: "Other", w: 1.2, l: 0.6, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), R(w * 0.62, 0, w * 0.38, l, { "stroke-width": 1 })] },
  hob: { label: "Hob", group: "Kitchen", w: 0.6, l: 0.6, draw: rings },
  oven: { label: "Oven / cooker", group: "Kitchen", w: 0.6, l: 0.6, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), R(w * 0.15, l * 0.2, w * 0.7, l * 0.65, { "stroke-width": 1 })] },
  fridge: { label: "Fridge / freezer", group: "Kitchen", w: 0.6, l: 0.65, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), L(0, l * 0.4, w, l * 0.4, { "stroke-width": 1 })] },
  "washing-machine": { label: "Washing machine", group: "Kitchen", w: 0.6, l: 0.6, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), C(w / 2, l * 0.55, Math.min(w, l) * 0.28, { "stroke-width": 1 })] },
  dishwasher: { label: "Dishwasher", group: "Kitchen", w: 0.6, l: 0.6, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), L(w * 0.15, l * 0.35, w * 0.85, l * 0.35, { "stroke-width": 1 })] },
  "kitchen-sink": { label: "Kitchen sink", group: "Kitchen", w: 0.9, l: 0.55, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), R(w * 0.08, l * 0.15, w * 0.5, l * 0.7, { "stroke-width": 1, rx: Math.min(3, l * 0.1) }), R(w * 0.62, l * 0.15, w * 0.3, l * 0.7, { "stroke-width": 1 })] },
  worktop: { label: "Worktop / unit", group: "Kitchen", w: 0.6, l: 0.6, draw: plain },
  bath: { label: "Bath", group: "Bathroom", w: 1.7, l: 0.72, draw: (w: number, l: number) => { const i = Math.min(5, l * 0.1, w * 0.05); return [R(0, 0, w, l, { ...WHITE, rx: Math.min(6, l * 0.2) }), R(i, i, w - 2 * i, l - 2 * i, { "stroke-width": 1, rx: Math.max(0, l * 0.3 - i) }), C(w - Math.min(12, w * 0.1), l / 2, Math.min(2.5, l * 0.1), { "stroke-width": 1 })]; } },
  shower: { label: "Shower", group: "Bathroom", w: 0.9, l: 0.9, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), L(0, 0, w, l, { "stroke-width": 1 }), C(w / 2, l / 2, 3, { "stroke-width": 1 })] },
  wc: { label: "WC", group: "Bathroom", w: 0.4, l: 0.7, draw: (w: number, l: number) => [R(0, 0, w, l * 0.28, WHITE), E(w / 2, l * 0.64, w / 2, l * 0.36, WHITE)] },
  basin: { label: "Wash basin", group: "Bathroom", w: 0.55, l: 0.42, draw: (w: number, l: number) => [R(0, 0, w, l, { ...WHITE, rx: Math.min(5, l * 0.2) }), E(w / 2, l / 2, w * 0.3, l * 0.3, { "stroke-width": 1 })] },
  radiator: { label: "Radiator", group: "Other", w: 1.0, l: 0.1, draw: (w: number, l: number) => {
      const fins = Math.max(2, Math.floor(w / 12));
      return [R(0, 0, w, l, WHITE), ...Array.from({ length: fins }, (_, i) => L(((i + 1) * w) / (fins + 1), 0, ((i + 1) * w) / (fins + 1), l, { "stroke-width": 1 }))];
    } },
  boiler: { label: "Boiler", group: "Other", w: 0.4, l: 0.4, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), P(`M ${round(w * 0.3)} ${round(l * 0.3)} L ${round(w * 0.3)} ${round(l * 0.7)} L ${round(w * 0.6)} ${round(l * 0.7)} Q ${round(w * 0.72)} ${round(l * 0.6)} ${round(w * 0.6)} ${round(l * 0.5)} Q ${round(w * 0.72)} ${round(l * 0.4)} ${round(w * 0.6)} ${round(l * 0.3)} Z`, { "stroke-width": 1 })] },
  column: { label: "Column", group: "Other", w: 0.3, l: 0.3, draw: (w: number, l: number) => [R(0, 0, w, l, { fill: INK, stroke: INK })] },
  "cupboard-built-in": { label: "Built-in cupboard", group: "Other", w: 1.0, l: 0.55, draw: cross },
  "storage-box": { label: "Storage / shelving", group: "Other", w: 0.8, l: 0.4, draw: plain },
} satisfies Record<string, SymbolDef>;

export type SymbolKind = keyof typeof SYMBOLS;
export const SYMBOL_KINDS = Object.keys(SYMBOLS) as SymbolKind[];
export const isSymbolKind = (v: unknown): v is SymbolKind => typeof v === "string" && Object.prototype.hasOwnProperty.call(SYMBOLS, v);
export const SYMBOL_GROUPS: SymbolGroup[] = ["Bedroom", "Living", "Kitchen", "Bathroom", "Other"];
export const symbolDef = (kind: SymbolKind): SymbolDef => SYMBOLS[kind];

// ---- the objects themselves ---------------------------------------------------------------------------------------
export type SymbolObject = { id: string; kind: "symbol"; symbol: SymbolKind; x: number; y: number; w: number; l: number; rot: number }; // x, y = CENTRE, metres
export type WallObject = { id: string; kind: "wall"; x1: number; y1: number; x2: number; y2: number; t: number }; // t = thickness, metres
export type LabelObject = { id: string; kind: "label"; x: number; y: number; text: string; size: number; rot: number }; // size in px (the plan's own units)
export type PlanObject = SymbolObject | WallObject | LabelObject;

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const inRange = (v: unknown, lo: number, hi: number): v is number => isNum(v) && v >= lo && v <= hi;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const normaliseRot = (deg: number) => ((Math.round(deg * 10) / 10) % 360 + 360) % 360;

export function cleanLabelText(v: unknown): string {
  if (typeof v !== "string") return "";
  // Control characters out - including the invisible ones that can make text show reversed or look like something
  // else (right-to-left overrides, zero-width characters) - whitespace tidied, length capped. (It is only ever shown
  // as text, never as markup.)
  return v
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, " ")
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL_CHARS);
}

const cleanId = (v: unknown, fallback: string): string => (typeof v === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : fallback);

// Rebuilds the list from untrusted data. Anything malformed is dropped (not repaired into something surprising), ids
// are made unique, and the list is capped - so what comes out is always safe to draw, store and count on.
export function cleanObjects(raw: unknown): PlanObject[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanObject[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_OBJECTS) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    let id = cleanId(o.id, `o${out.length + 1}`);
    if (seen.has(id)) id = `${id}-${out.length + 1}`;
    if (o.kind === "symbol" && isSymbolKind(o.symbol) && inRange(o.x, -MAX_COORD, MAX_COORD) && inRange(o.y, -MAX_COORD, MAX_COORD) && inRange(o.w, MIN_SIZE, MAX_SIZE) && inRange(o.l, MIN_SIZE, MAX_SIZE)) {
      out.push({ id, kind: "symbol", symbol: o.symbol, x: r3(o.x), y: r3(o.y), w: r3(o.w), l: r3(o.l), rot: isNum(o.rot) ? normaliseRot(o.rot) : 0 });
    } else if (o.kind === "wall" && inRange(o.x1, -MAX_COORD, MAX_COORD) && inRange(o.y1, -MAX_COORD, MAX_COORD) && inRange(o.x2, -MAX_COORD, MAX_COORD) && inRange(o.y2, -MAX_COORD, MAX_COORD)) {
      if (Math.hypot((o.x2 as number) - (o.x1 as number), (o.y2 as number) - (o.y1 as number)) < 0.02) continue; // a wall with no length is nothing
      out.push({ id, kind: "wall", x1: r3(o.x1), y1: r3(o.y1), x2: r3(o.x2 as number), y2: r3(o.y2 as number), t: inRange(o.t, 0.02, 1) ? r3(o.t) : 0.1 });
    } else if (o.kind === "label" && inRange(o.x, -MAX_COORD, MAX_COORD) && inRange(o.y, -MAX_COORD, MAX_COORD)) {
      const text = cleanLabelText(o.text);
      if (!text) continue;
      out.push({ id, kind: "label", x: r3(o.x), y: r3(o.y), text, size: inRange(o.size, 6, 40) ? Math.round(o.size) : 12, rot: isNum(o.rot) ? normaliseRot(o.rot) : 0 });
    } else continue;
    seen.add(id);
  }
  return out;
}

// ---- geometry ---------------------------------------------------------------------------------------------------
export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

const rotate = (x: number, y: number, deg: number): [number, number] => {
  const r = (deg * Math.PI) / 180;
  return [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)];
};

// The object's corners on the plan, in metres - used for bounds, hit areas and alignment.
export function objectCorners(o: PlanObject, pxPerMetre = 40): [number, number][] {
  if (o.kind === "symbol") {
    return ([[-o.w / 2, -o.l / 2], [o.w / 2, -o.l / 2], [o.w / 2, o.l / 2], [-o.w / 2, o.l / 2]] as [number, number][]).map(([x, y]) => {
      const [rx, ry] = rotate(x, y, o.rot);
      return [o.x + rx, o.y + ry] as [number, number];
    });
  }
  if (o.kind === "wall") {
    const dx = o.x2 - o.x1, dy = o.y2 - o.y1, len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (o.t / 2), ny = (dx / len) * (o.t / 2);
    return [[o.x1 + nx, o.y1 + ny], [o.x2 + nx, o.y2 + ny], [o.x2 - nx, o.y2 - ny], [o.x1 - nx, o.y1 - ny]];
  }
  // A label's box is estimated from its text (about 0.55 em per character) - it only needs to be about right.
  const w = (o.text.length * o.size * 0.55) / pxPerMetre, h = (o.size * 1.2) / pxPerMetre;
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as [number, number][]).map(([x, y]) => {
    const [rx, ry] = rotate(x, y, o.rot);
    return [o.x + rx, o.y + ry] as [number, number];
  });
}

export function objectBounds(o: PlanObject, pxPerMetre = 40): Bounds {
  const pts = objectCorners(o, pxPerMetre);
  return { minX: Math.min(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])), maxX: Math.max(...pts.map((p) => p[0])), maxY: Math.max(...pts.map((p) => p[1])) };
}

export function boundsOfAll(objects: PlanObject[], pxPerMetre = 40): Bounds | null {
  if (objects.length === 0) return null;
  const bs = objects.map((o) => objectBounds(o, pxPerMetre));
  return { minX: Math.min(...bs.map((b) => b.minX)), minY: Math.min(...bs.map((b) => b.minY)), maxX: Math.max(...bs.map((b) => b.maxX)), maxY: Math.max(...bs.map((b) => b.maxY)) };
}

// ---- drawing ----------------------------------------------------------------------------------------------------
// A drawable description of an object, in the plan's pixel space (metres x pxPerMetre, plus the margin the editor
// leaves round the plan). Used by both the editor (as React elements) and the plan sheet (as SVG text).
export type Drawn = { transform: string; prims: Prim[]; text?: { x: number; y: number; value: string; size: number } };

export function drawObject(o: PlanObject, pxPerMetre = 40, originPx = 10): Drawn {
  if (o.kind === "symbol") {
    const w = o.w * pxPerMetre, l = o.l * pxPerMetre;
    return { transform: `translate(${r3(o.x * pxPerMetre + originPx)}, ${r3(o.y * pxPerMetre + originPx)}) rotate(${o.rot}) translate(${r3(-w / 2)}, ${r3(-l / 2)})`, prims: SYMBOLS[o.symbol].draw(w, l) };
  }
  if (o.kind === "wall") {
    return { transform: "", prims: [{ t: "line", a: { x1: r3(o.x1 * pxPerMetre + originPx), y1: r3(o.y1 * pxPerMetre + originPx), x2: r3(o.x2 * pxPerMetre + originPx), y2: r3(o.y2 * pxPerMetre + originPx), stroke: INK, "stroke-width": r3(Math.max(1, o.t * pxPerMetre)), "stroke-linecap": "butt" } }] };
  }
  const cx = o.x * pxPerMetre + originPx, cy = o.y * pxPerMetre + originPx;
  return { transform: o.rot ? `rotate(${o.rot}, ${r3(cx)}, ${r3(cy)})` : "", prims: [], text: { x: r3(cx), y: r3(cy + o.size * 0.35), value: o.text, size: o.size } };
}

const attrString = (a: Record<string, number | string>) => Object.entries(a).map(([k, v]) => `${k}="${typeof v === "number" ? r3(v) : String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)}"`).join(" ");

// The same drawing as SVG text (for the plan sheet's markup).
export function objectToSvg(o: PlanObject, pxPerMetre = 40, originPx = 10): string {
  const d = drawObject(o, pxPerMetre, originPx);
  const inner = d.prims.map((p) => `<${p.t} ${attrString(p.a)}/>`).join("");
  const text = d.text ? `<text x="${d.text.x}" y="${d.text.y}" font-size="${d.text.size}" fill="${INK}" text-anchor="middle">${d.text.value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)}</text>` : "";
  return d.transform ? `<g transform="${d.transform}">${inner}${text}</g>` : `${inner}${text}`;
}

// ---- editing helpers (pure, so they can be tested without the editor) -------------------------------------------
export type Align = "left" | "centre" | "right" | "top" | "middle" | "bottom";

// Moves each object so its edge/centre lines up with the group's. Returns new objects; the input is untouched.
export function alignObjects(objects: PlanObject[], ids: string[], how: Align, pxPerMetre = 40): PlanObject[] {
  const sel = objects.filter((o) => ids.includes(o.id));
  if (sel.length < 2) return objects;
  const bounds = new Map(sel.map((o) => [o.id, objectBounds(o, pxPerMetre)]));
  const all = boundsOfAll(sel, pxPerMetre)!;
  const target = (b: Bounds): [number, number] => {
    switch (how) {
      case "left": return [all.minX - b.minX, 0];
      case "right": return [all.maxX - b.maxX, 0];
      case "centre": return [(all.minX + all.maxX) / 2 - (b.minX + b.maxX) / 2, 0];
      case "top": return [0, all.minY - b.minY];
      case "bottom": return [0, all.maxY - b.maxY];
      default: return [0, (all.minY + all.maxY) / 2 - (b.minY + b.maxY) / 2];
    }
  };
  return objects.map((o) => (ids.includes(o.id) ? moveObject(o, ...target(bounds.get(o.id)!)) : o));
}

// Spaces three or more objects so the gaps between them are equal, keeping the two outermost (by centre) where they
// are. Objects that sit inside one another (a short wall within a long one) have no meaningful "gap", so this is meant
// for objects side by side.
export function distributeObjects(objects: PlanObject[], ids: string[], axis: "horizontal" | "vertical", pxPerMetre = 40): PlanObject[] {
  const sel = objects.filter((o) => ids.includes(o.id));
  if (sel.length < 3) return objects;
  const b = (o: PlanObject) => objectBounds(o, pxPerMetre);
  const lo = (o: PlanObject) => (axis === "horizontal" ? b(o).minX : b(o).minY);
  const hi = (o: PlanObject) => (axis === "horizontal" ? b(o).maxX : b(o).maxY);
  const centre = (o: PlanObject) => (lo(o) + hi(o)) / 2;
  const sorted = [...sel].sort((p, q) => centre(p) - centre(q));
  const first = lo(sorted[0]), last = hi(sorted[sorted.length - 1]);
  const total = sorted.reduce((s, o) => s + (hi(o) - lo(o)), 0);
  const gap = (last - first - total) / (sorted.length - 1);
  let cursor = first;
  const delta = new Map<string, number>();
  for (const o of sorted) {
    delta.set(o.id, cursor - lo(o));
    cursor += hi(o) - lo(o) + gap;
  }
  return objects.map((o) => (delta.has(o.id) ? (axis === "horizontal" ? moveObject(o, delta.get(o.id)!, 0) : moveObject(o, 0, delta.get(o.id)!)) : o));
}

export function moveObject<T extends PlanObject>(o: T, dx: number, dy: number): T {
  const c = (v: number) => Math.max(-MAX_COORD, Math.min(MAX_COORD, r3(v)));
  if (o.kind === "wall") return { ...o, x1: c(o.x1 + dx), y1: c(o.y1 + dy), x2: c(o.x2 + dx), y2: c(o.y2 + dy) };
  return { ...o, x: c(o.x + dx), y: c(o.y + dy) };
}

let counter = 0;
export function newObjectId(existing: PlanObject[]): string {
  const used = new Set(existing.map((o) => o.id));
  let id: string;
  do id = `o${Date.now().toString(36)}${(counter++).toString(36)}`;
  while (used.has(id));
  return id.slice(0, 40);
}

// A copy of the objects, offset a little so it can be seen, with fresh ids. Capped so duplicating can never exceed the limit.
export function duplicateObjects(objects: PlanObject[], ids: string[], offset = 0.3): { objects: PlanObject[]; newIds: string[] } {
  const room = Math.max(0, MAX_OBJECTS - objects.length);
  const copies = objects.filter((o) => ids.includes(o.id)).slice(0, room).map((o) => ({ ...moveObject(o, offset, offset) }));
  const out = [...objects];
  const newIds: string[] = [];
  for (const c of copies) {
    const id = newObjectId(out);
    out.push({ ...c, id } as PlanObject);
    newIds.push(id);
  }
  return { objects: out, newIds };
}
