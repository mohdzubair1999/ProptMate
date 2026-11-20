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
export type SymbolGroup = "Bedroom" | "Living" | "Kitchen" | "Bathroom" | "Other" | "Safety and services";

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

// ---- safety and services: alarms, the stopcock, the consumer unit, meters, sockets ----
// Drawn inside a round (or boxed) outline from simple strokes, so each one is recognisable on a printed plan without any text in the drawing.
const disc = (w: number, l: number) => ({ cx: w / 2, cy: l / 2, d: Math.min(w, l) });
const bolt = (cx: number, cy: number, d: number): Prim => P(`M ${round(cx + 0.06 * d)} ${round(cy - 0.3 * d)} L ${round(cx - 0.14 * d)} ${round(cy + 0.04 * d)} L ${round(cx + 0.02 * d)} ${round(cy + 0.04 * d)} L ${round(cx - 0.08 * d)} ${round(cy + 0.3 * d)}`, { "stroke-width": 1.2 });
const alarm = (mark: (cx: number, cy: number, d: number) => Prim[]) => (w: number, l: number): Prim[] => { const { cx, cy, d } = disc(w, l); return [C(cx, cy, d / 2, WHITE), C(cx, cy, d * 0.36, { "stroke-width": 0.8 }), ...mark(cx, cy, d)]; };
const letterS = (cx: number, cy: number, d: number): Prim[] => [P(`M ${round(cx + 0.14 * d)} ${round(cy - 0.2 * d)} C ${round(cx + 0.14 * d)} ${round(cy - 0.34 * d)} ${round(cx - 0.14 * d)} ${round(cy - 0.34 * d)} ${round(cx - 0.14 * d)} ${round(cy - 0.1 * d)} C ${round(cx - 0.14 * d)} ${round(cy + 0.04 * d)} ${round(cx + 0.14 * d)} ${round(cy - 0.02 * d)} ${round(cx + 0.14 * d)} ${round(cy + 0.12 * d)} C ${round(cx + 0.14 * d)} ${round(cy + 0.34 * d)} ${round(cx - 0.14 * d)} ${round(cy + 0.34 * d)} ${round(cx - 0.14 * d)} ${round(cy + 0.2 * d)}`, { "stroke-width": 1.2 })];
const letterH = (cx: number, cy: number, d: number): Prim[] => [L(cx - 0.12 * d, cy - 0.2 * d, cx - 0.12 * d, cy + 0.2 * d, { "stroke-width": 1.2 }), L(cx + 0.12 * d, cy - 0.2 * d, cx + 0.12 * d, cy + 0.2 * d, { "stroke-width": 1.2 }), L(cx - 0.12 * d, cy, cx + 0.12 * d, cy, { "stroke-width": 1.2 })];
const lettersCO = (cx: number, cy: number, d: number): Prim[] => [P(`M ${round(cx - 0.04 * d)} ${round(cy - 0.17 * d)} C ${round(cx - 0.3 * d)} ${round(cy - 0.2 * d)} ${round(cx - 0.3 * d)} ${round(cy + 0.2 * d)} ${round(cx - 0.04 * d)} ${round(cy + 0.17 * d)}`, { "stroke-width": 1.2 }), C(cx + 0.14 * d, cy, 0.14 * d, { "stroke-width": 1.2 })];
const meter = (mark: (cx: number, cy: number, d: number) => Prim[]) => (w: number, l: number): Prim[] => { const { cx, cy, d } = disc(w, l); return [R(0, 0, w, l, WHITE), C(cx, cy, d * 0.36, { "stroke-width": 1 }), ...mark(cx, cy, d)]; };
const flame = (cx: number, cy: number, d: number): Prim[] => [P(`M ${round(cx)} ${round(cy - 0.26 * d)} C ${round(cx + 0.2 * d)} ${round(cy - 0.05 * d)} ${round(cx + 0.16 * d)} ${round(cy + 0.2 * d)} ${round(cx)} ${round(cy + 0.2 * d)} C ${round(cx - 0.16 * d)} ${round(cy + 0.2 * d)} ${round(cx - 0.2 * d)} ${round(cy - 0.02 * d)} ${round(cx)} ${round(cy - 0.26 * d)}`, { "stroke-width": 1 })];
const drop = (cx: number, cy: number, d: number): Prim[] => [P(`M ${round(cx)} ${round(cy - 0.26 * d)} C ${round(cx + 0.1 * d)} ${round(cy - 0.1 * d)} ${round(cx + 0.18 * d)} ${round(cy)} ${round(cx + 0.18 * d)} ${round(cy + 0.1 * d)} C ${round(cx + 0.18 * d)} ${round(cy + 0.26 * d)} ${round(cx - 0.18 * d)} ${round(cy + 0.26 * d)} ${round(cx - 0.18 * d)} ${round(cy + 0.1 * d)} C ${round(cx - 0.18 * d)} ${round(cy)} ${round(cx - 0.1 * d)} ${round(cy - 0.1 * d)} ${round(cx)} ${round(cy - 0.26 * d)}`, { "stroke-width": 1 })];

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
  "smoke-alarm": { label: "Smoke alarm", group: "Safety and services", w: 0.3, l: 0.3, draw: alarm(letterS) },
  "heat-alarm": { label: "Heat alarm", group: "Safety and services", w: 0.3, l: 0.3, draw: alarm(letterH) },
  "co-alarm": { label: "Carbon monoxide alarm", group: "Safety and services", w: 0.3, l: 0.3, draw: alarm(lettersCO) },
  stopcock: { label: "Stopcock", group: "Safety and services", w: 0.3, l: 0.3, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), L(0, l / 2, w, l / 2, { "stroke-width": 1 }), { t: "polygon", a: { points: `${round(w * 0.2)},${round(l * 0.3)} ${round(w * 0.5)},${round(l * 0.5)} ${round(w * 0.2)},${round(l * 0.7)}`, ...base, "stroke-width": 1 } }, { t: "polygon", a: { points: `${round(w * 0.8)},${round(l * 0.3)} ${round(w * 0.5)},${round(l * 0.5)} ${round(w * 0.8)},${round(l * 0.7)}`, ...base, "stroke-width": 1 } }, L(w / 2, l / 2, w / 2, l * 0.18, { "stroke-width": 1 }), L(w * 0.38, l * 0.18, w * 0.62, l * 0.18, { "stroke-width": 1 })] },
  "consumer-unit": { label: "Fuse box / consumer unit", group: "Safety and services", w: 0.4, l: 0.3, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), ...Array.from({ length: 5 }, (_, i) => R(w * (0.09 + 0.17 * i), l * 0.58, w * 0.12, l * 0.3, { "stroke-width": 1 })), P(`M ${round(w * 0.55)} ${round(l * 0.08)} L ${round(w * 0.4)} ${round(l * 0.3)} L ${round(w * 0.52)} ${round(l * 0.3)} L ${round(w * 0.42)} ${round(l * 0.48)}`, { "stroke-width": 1 })] },
  "meter-electric": { label: "Electricity meter", group: "Safety and services", w: 0.3, l: 0.3, draw: meter((cx, cy, d) => [bolt(cx, cy, d)]) },
  "meter-gas": { label: "Gas meter", group: "Safety and services", w: 0.3, l: 0.3, draw: meter(flame) },
  "meter-water": { label: "Water meter", group: "Safety and services", w: 0.3, l: 0.3, draw: meter(drop) },
  socket: { label: "Double socket", group: "Safety and services", w: 0.3, l: 0.2, draw: (w: number, l: number) => [R(0, 0, w, l, WHITE), C(w * 0.3, l * 0.5, Math.min(w, l) * 0.22, { "stroke-width": 1 }), C(w * 0.7, l * 0.5, Math.min(w, l) * 0.22, { "stroke-width": 1 })] },
  "fire-extinguisher": { label: "Fire extinguisher", group: "Safety and services", w: 0.3, l: 0.3, draw: (w: number, l: number) => [C(w / 2, l / 2, Math.min(w, l) / 2, WHITE), R(w * 0.36, l * 0.34, w * 0.28, l * 0.42, { "stroke-width": 1, rx: Math.min(2, w * 0.05) }), L(w * 0.44, l * 0.34, w * 0.44, l * 0.22, { "stroke-width": 1 }), L(w * 0.44, l * 0.22, w * 0.6, l * 0.22, { "stroke-width": 1 })] },
} satisfies Record<string, SymbolDef>;

export type SymbolKind = keyof typeof SYMBOLS;
export const SYMBOL_KINDS = Object.keys(SYMBOLS) as SymbolKind[];
export const isSymbolKind = (v: unknown): v is SymbolKind => typeof v === "string" && Object.prototype.hasOwnProperty.call(SYMBOLS, v);
export const SYMBOL_GROUPS: SymbolGroup[] = ["Bedroom", "Living", "Kitchen", "Bathroom", "Other", "Safety and services"];
export const symbolDef = (kind: SymbolKind): SymbolDef => SYMBOLS[kind];

// ---- the objects themselves ---------------------------------------------------------------------------------------
export type SymbolObject = { id: string; kind: "symbol"; symbol: SymbolKind; x: number; y: number; w: number; l: number; rot: number; lyr?: string }; // x, y = CENTRE, metres
export type WallObject = { id: string; kind: "wall"; x1: number; y1: number; x2: number; y2: number; t: number; lyr?: string }; // t = thickness, metres
// size in px (the plan's own units). A label with a `pin` number is a DEFECT PIN: a numbered orange marker whose text is the note, listed in the sheet's key.
export type LabelObject = { id: string; kind: "label"; x: number; y: number; text: string; size: number; rot: number; pin?: number; lyr?: string };
export const MAX_PIN = 99;
// A dimension: the two points that are measured, and how far out the dimension line sits from them (metres; positive to the left of the way from the first point to the
// second, negative to the right). The length shown is always worked out from the points, so it can never disagree with the plan.
export type DimObject = { id: string; kind: "dim"; x1: number; y1: number; x2: number; y2: number; off: number; lyr?: string }; // lyr: the name of a layer of the person's own, when it has been put on one
export const MAX_DIM_OFFSET = 10;
export const DEFAULT_DIM_OFFSET = 0.5;
export const DIM_COLOUR = "#0E7490";
export type PlanObject = SymbolObject | WallObject | LabelObject | DimObject;
// The groups a person can hide while working ("layers"). Hiding only tidies the screen: hidden items are still on the plan and still print, export and share.
export type ObjectLayer = "furniture" | "services" | "labels" | "pins" | "walls" | "dimensions";
export const OBJECT_LAYERS: { id: ObjectLayer; label: string }[] = [
  { id: "furniture", label: "Furniture" },
  { id: "services", label: "Safety and services" },
  { id: "labels", label: "Labels" },
  { id: "pins", label: "Defect pins" },
  { id: "walls", label: "Free-standing walls" },
  { id: "dimensions", label: "Dimensions" },
];
export function objectLayer(o: PlanObject): ObjectLayer {
  if (o.kind === "wall") return "walls";
  if (o.kind === "dim") return "dimensions";
  if (o.kind === "label") return typeof o.pin === "number" ? "pins" : "labels";
  return SYMBOLS[o.symbol]?.group === "Safety and services" ? "services" : "furniture";
}
export const isPin = (o: PlanObject): o is LabelObject & { pin: number } => o.kind === "label" && typeof o.pin === "number";
// the smallest pin number not yet used on this floor (1 to 99), or null when all 99 are in use
export function nextPinNumber(objects: PlanObject[]): number | null {
  const used = new Set(objects.filter(isPin).map((o) => o.pin));
  for (let n = 1; n <= MAX_PIN; n++) if (!used.has(n)) return n;
  return null;
}

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
  const names = new Set<string>();
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
    } else if (o.kind === "dim" && inRange(o.x1, -MAX_COORD, MAX_COORD) && inRange(o.y1, -MAX_COORD, MAX_COORD) && inRange(o.x2, -MAX_COORD, MAX_COORD) && inRange(o.y2, -MAX_COORD, MAX_COORD)) {
      if (Math.hypot((o.x2 as number) - (o.x1 as number), (o.y2 as number) - (o.y1 as number)) < 0.05) continue; // a dimension of nothing is nothing
      const off = isNum(o.off) ? Math.max(-MAX_DIM_OFFSET, Math.min(MAX_DIM_OFFSET, o.off)) : DEFAULT_DIM_OFFSET;
      out.push({ id, kind: "dim", x1: r3(o.x1), y1: r3(o.y1), x2: r3(o.x2 as number), y2: r3(o.y2 as number), off: r3(off) });
    } else if (o.kind === "label" && inRange(o.x, -MAX_COORD, MAX_COORD) && inRange(o.y, -MAX_COORD, MAX_COORD)) {
      const text = cleanLabelText(o.text);
      if (!text) continue;
      const pin = typeof o.pin === "number" && Number.isInteger(o.pin) && o.pin >= 1 && o.pin <= MAX_PIN ? o.pin : undefined;
      out.push({ id, kind: "label", x: r3(o.x), y: r3(o.y), text, size: inRange(o.size, 6, 40) ? Math.round(o.size) : 12, rot: pin ? 0 : isNum(o.rot) ? normaliseRot(o.rot) : 0, ...(pin ? { pin } : {}) });
    } else continue;
    // a layer of the person's own: kept only when its name is valid and not one of the built-in layers' names; at most MAX_CUSTOM_LAYERS different names per floor (others go back to their usual layer)
    const lyr = cleanLayerName(o.lyr);
    if (lyr) {
      const known = [...names].find((n) => n.toLowerCase() === lyr.toLowerCase());
      if (known || names.size < MAX_CUSTOM_LAYERS) { if (!known) names.add(lyr); (out[out.length - 1] as { lyr?: string }).lyr = known ?? lyr; }
    }
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
  if (o.kind === "dim") {
    const g = dimGeometry(o);
    return [[o.x1, o.y1], [o.x2, o.y2], [g.b2.x, g.b2.y], [g.a2.x, g.a2.y]];
  }
  if (o.kind === "wall") {
    const dx = o.x2 - o.x1, dy = o.y2 - o.y1, len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * (o.t / 2), ny = (dx / len) * (o.t / 2);
    return [[o.x1 + nx, o.y1 + ny], [o.x2 + nx, o.y2 + ny], [o.x2 - nx, o.y2 - ny], [o.x1 - nx, o.y1 - ny]];
  }
  // A pin is a fixed round marker, 18 px across, however long its note is.
  // A label's box is estimated from its text (about 0.55 em per character) - it only needs to be about right.
  const w = isPin(o) ? 18 / pxPerMetre : (o.text.length * o.size * 0.55) / pxPerMetre, h = isPin(o) ? 18 / pxPerMetre : (o.size * 1.2) / pxPerMetre;
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
export type Drawn = { transform: string; prims: Prim[]; text?: { x: number; y: number; value: string; size: number; fill?: string; bold?: boolean } };
export const PIN_COLOUR = "#C2410C";

// Where a dimension's line sits: the unit direction u from the first point to the second, the unit normal n (u turned a quarter turn, so a positive offset is on that side),
// and the two ends of the dimension line itself.
export function dimGeometry(o: DimObject): { length: number; ux: number; uy: number; nx: number; ny: number; a2: { x: number; y: number }; b2: { x: number; y: number } } {
  const dx = o.x2 - o.x1, dy = o.y2 - o.y1, length = Math.hypot(dx, dy);
  const ux = length > 1e-9 ? dx / length : 1, uy = length > 1e-9 ? dy / length : 0;
  const nx = -uy, ny = ux;
  return { length, ux, uy, nx, ny, a2: { x: o.x1 + nx * o.off, y: o.y1 + ny * o.off }, b2: { x: o.x2 + nx * o.off, y: o.y2 + ny * o.off } };
}
// The offset that puts the dimension line through a point (what the third click of the Dimension tool sets), to the 5 cm grid and within the limits
export function dimOffsetFor(a: { x: number; y: number }, b: { x: number; y: number }, p: { x: number; y: number }): number {
  const g = dimGeometry({ id: "", kind: "dim", x1: a.x, y1: a.y, x2: b.x, y2: b.y, off: 0 });
  const raw = (p.x - a.x) * g.nx + (p.y - a.y) * g.ny;
  return Math.max(-MAX_DIM_OFFSET, Math.min(MAX_DIM_OFFSET, r3(Math.round(raw / 0.05) * 0.05)));
}
export const dimText = (o: DimObject): string => `${dimGeometry(o).length.toFixed(2)} m`;

const KEEP_COLOURS = ["none", "#ffffff", "white", "transparent"]; // the white of a symbol's gaps and an empty fill stay as they are
function recolourDrawn(d: Drawn, colour: string): Drawn {
  const re = (v: unknown) => typeof v === "string" && !KEEP_COLOURS.includes(v.toLowerCase());
  return { ...d, prims: d.prims.map((p) => ({ ...p, a: { ...p.a, ...(re(p.a.stroke) ? { stroke: colour } : {}), ...(re(p.a.fill) ? { fill: colour } : {}) } })), ...(d.text ? { text: { ...d.text, fill: colour } } : {}) };
}
// How an object is drawn; `colour` (a layer's colour) replaces its linework and text colour, except for a defect pin, whose orange means something
export function drawObject(o: PlanObject, pxPerMetre = 40, originPx = 10, colour?: string): Drawn {
  const d = drawObjectBase(o, pxPerMetre, originPx);
  return colour && !isPin(o) ? recolourDrawn(d, colour) : d;
}
function drawObjectBase(o: PlanObject, pxPerMetre = 40, originPx = 10): Drawn {
  if (o.kind === "dim") {
    // Drawn in a frame that is turned to lie along the line, so its text is level; the frame is turned half a turn more when that is what makes the text read the right way up.
    const g = dimGeometry(o), px = (m: number) => m * pxPerMetre + originPx;
    const mx = px((g.a2.x + g.b2.x) / 2), my = px((g.a2.y + g.b2.y) / 2);
    const theta = (Math.atan2(o.y2 - o.y1, o.x2 - o.x1) * 180) / Math.PI;
    const phi = theta >= 90 - 1e-9 ? theta - 180 : theta < -90 - 1e-9 ? theta + 180 : theta; // text reads left to right, and a vertical dimension reads from the bottom up, as on a drawing
    const fx = Math.cos((phi * Math.PI) / 180), fy = Math.sin((phi * Math.PI) / 180);
    const loc = (xm: number, ym: number): [number, number] => [(px(xm) - mx) * fx + (px(ym) - my) * fy, -(px(xm) - mx) * fy + (px(ym) - my) * fx];
    const [ax, ay] = loc(g.a2.x, g.a2.y), [bx, by] = loc(g.b2.x, g.b2.y), [e1x, e1y] = loc(o.x1, o.y1), [e2x, e2y] = loc(o.x2, o.y2);
    const S = { stroke: DIM_COLOUR, "stroke-width": 1, fill: "none" };
    const prims: Prim[] = [{ t: "line", a: { x1: r3(ax), y1: r3(ay), x2: r3(bx), y2: r3(by), ...S } }];
    for (const [x, y] of [[ax, ay], [bx, by]]) prims.push({ t: "line", a: { x1: r3(x - 4), y1: r3(y + 4), x2: r3(x + 4), y2: r3(y - 4), ...S } }); // a slash at each end, as on a drawing
    if (Math.abs(e1y - ay) > 6) {
      const d = e1y - ay < 0 ? 1 : -1; // towards, and then past, the dimension line
      for (const [ex, ey, lx] of [[e1x, e1y, ax], [e2x, e2y, bx]]) prims.push({ t: "line", a: { x1: r3(ex), y1: r3(ey + d * 2), x2: r3(lx), y2: r3(ay + d * 4), ...S } });
    }
    return { transform: `translate(${r3(mx)}, ${r3(my)}) rotate(${r3(phi)})`, prims, text: { x: 0, y: r3(ay - 4), value: dimText(o), size: 11, fill: DIM_COLOUR } };
  }
  if (o.kind === "symbol") {
    const w = o.w * pxPerMetre, l = o.l * pxPerMetre;
    return { transform: `translate(${r3(o.x * pxPerMetre + originPx)}, ${r3(o.y * pxPerMetre + originPx)}) rotate(${o.rot}) translate(${r3(-w / 2)}, ${r3(-l / 2)})`, prims: SYMBOLS[o.symbol].draw(w, l) };
  }
  if (o.kind === "wall") {
    return { transform: "", prims: [{ t: "line", a: { x1: r3(o.x1 * pxPerMetre + originPx), y1: r3(o.y1 * pxPerMetre + originPx), x2: r3(o.x2 * pxPerMetre + originPx), y2: r3(o.y2 * pxPerMetre + originPx), stroke: INK, "stroke-width": r3(Math.max(1, o.t * pxPerMetre)), "stroke-linecap": "butt" } }] };
  }
  const cx = o.x * pxPerMetre + originPx, cy = o.y * pxPerMetre + originPx;
  // a pin: an orange disc with its number in white, never turned (so the number always reads upright); its note is in the sheet's key, not on the plan
  if (isPin(o)) return { transform: "", prims: [{ t: "circle", a: { cx: r3(cx), cy: r3(cy), r: 9, fill: PIN_COLOUR, stroke: "#FFFFFF", "stroke-width": 1.5 } }], text: { x: r3(cx), y: r3(cy + 3.7), value: String(o.pin), size: 10.5, fill: "#FFFFFF", bold: true } };
  return { transform: o.rot ? `rotate(${o.rot}, ${r3(cx)}, ${r3(cy)})` : "", prims: [], text: { x: r3(cx), y: r3(cy + o.size * 0.35), value: o.text, size: o.size } };
}

const attrString = (a: Record<string, number | string>) => Object.entries(a).map(([k, v]) => `${k}="${typeof v === "number" ? r3(v) : String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)}"`).join(" ");

// Just the shapes of a drawing as SVG text (for small pictures such as the sheet's key).
export const primsToSvg = (prims: Prim[]): string => prims.map((p) => `<${p.t} ${attrString(p.a)}/>`).join("");

// The same drawing as SVG text (for the plan sheet's markup).
export function objectToSvg(o: PlanObject, pxPerMetre = 40, originPx = 10, colour?: string): string {
  const d = drawObject(o, pxPerMetre, originPx, colour);
  const inner = d.prims.map((p) => `<${p.t} ${attrString(p.a)}/>`).join("");
  const text = d.text ? `<text x="${d.text.x}" y="${d.text.y}" font-size="${d.text.size}" fill="${d.text.fill ?? INK}"${d.text.bold ? ' font-weight="700"' : ""} text-anchor="middle">${d.text.value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)}</text>` : "";
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
  if (o.kind === "wall" || o.kind === "dim") return { ...o, x1: c(o.x1 + dx), y1: c(o.y1 + dy), x2: c(o.x2 + dx), y2: c(o.y2 + dy) };
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
    // a copy of a pin gets the next free pin number (two pins must never share one), and no copy is made if all 99 are in use
    if (isPin(c as PlanObject)) {
      const n = nextPinNumber(out);
      if (n === null) continue;
      out.push({ ...c, id, pin: n } as PlanObject);
      newIds.push(id);
      continue;
    }
    out.push({ ...c, id } as PlanObject);
    newIds.push(id);
  }
  return { objects: out, newIds };
}

// ---- mirror, copies in a row, and a room's dimensions -----------------------------------------------------------------
// "vertical" flips left to right (across a vertical line through the middle of what is selected); "horizontal" flips top to bottom. The selection is flipped in
// place: what it covers does not change, only which side things are on. A dimension keeps measuring the same thing (its offset changes sides to match).
export type MirrorAxis = "vertical" | "horizontal";
export function mirrorObjects(objects: PlanObject[], ids: string[], axis: MirrorAxis, pxPerMetre = 40): PlanObject[] {
  const set = new Set(Array.isArray(ids) ? ids : []);
  const sel = (Array.isArray(objects) ? objects : []).filter((o) => set.has(o.id));
  if (sel.length === 0) return objects;
  const b = boundsOfAll(sel, pxPerMetre)!;
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const fx = (x: number) => r3(2 * cx - x) + 0, fy = (y: number) => r3(2 * cy - y) + 0; // "+ 0" keeps a -0 from appearing
  const v = axis === "vertical";
  return objects.map((o): PlanObject => {
    if (!set.has(o.id)) return o;
    if (o.kind === "symbol") return v ? { ...o, x: fx(o.x), rot: normaliseRot(180 - o.rot) } : { ...o, y: fy(o.y), rot: normaliseRot(-o.rot) };
    if (o.kind === "wall") return v ? { ...o, x1: fx(o.x1), x2: fx(o.x2) } : { ...o, y1: fy(o.y1), y2: fy(o.y2) };
    if (o.kind === "dim") return v ? { ...o, x1: fx(o.x1), x2: fx(o.x2), off: r3(-o.off) + 0 } : { ...o, y1: fy(o.y1), y2: fy(o.y2), off: r3(-o.off) + 0 };
    return v ? { ...o, x: fx(o.x), rot: isPin(o) ? 0 : normaliseRot(-o.rot) } : { ...o, y: fy(o.y), rot: isPin(o) ? 0 : normaliseRot(-o.rot) };
  });
}

export const MAX_ARRAY = 50;
// Copies of the selection in a row: `count` of them, each a further (dx, dy) metres on from the last. A step that would put anything off the top or left of the plan,
// or past the limit on how many objects a floor holds, is not made (nor is any later step), and the result says why it stopped.
export function arrayObjects(objects: PlanObject[], ids: string[], count: number, dx: number, dy: number): { objects: PlanObject[]; added: number; stopped: "edge" | "limit" | "none" | null } {
  const set = new Set(Array.isArray(ids) ? ids : []);
  const sel = (Array.isArray(objects) ? objects : []).filter((o) => set.has(o.id));
  const n = Number.isFinite(count) ? Math.max(0, Math.min(MAX_ARRAY, Math.floor(count))) : 0;
  if (sel.length === 0 || n === 0) return { objects, added: 0, stopped: null };
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) < 0.01) return { objects, added: 0, stopped: "none" }; // copies on top of the original are not copies
  const out = [...objects];
  let added = 0, stopped: "edge" | "limit" | null = null;
  for (let i = 1; i <= n; i++) {
    if (out.length + sel.length > MAX_OBJECTS) { stopped = "limit"; break; }
    const copies = sel.map((o) => moveObject(o, dx * i, dy * i));
    if (copies.some((c) => { const b = objectBounds(c); return b.minX < -1e-9 || b.minY < -1e-9; })) { stopped = "edge"; break; }
    for (const c of copies) {
      const id = newObjectId(out);
      if (isPin(c as PlanObject)) { const p = nextPinNumber(out); if (p === null) continue; out.push({ ...c, id, pin: p } as PlanObject); added++; continue; }
      out.push({ ...c, id } as PlanObject);
      added++;
    }
  }
  return { objects: out, added, stopped };
}

// The two overall dimensions of a room (its width along the bottom and its length down the right-hand side), set 0.5 m outside it, as plain numbers for the caller to
// make objects from. A dimension that is already there between the same two points is not made again; a side under 0.3 m is not measured.
export function roomDimensionSpecs(box: { x: number; y: number; w: number; h: number }, existing: PlanObject[]): { x1: number; y1: number; x2: number; y2: number; off: number }[] {
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) return [];
  const { x, y, w, h } = box;
  const want = [
    { x1: r3(x), y1: r3(y + h), x2: r3(x + w), y2: r3(y + h), off: 0.5, len: w }, // the width, below the room
    { x1: r3(x + w), y1: r3(y), x2: r3(x + w), y2: r3(y + h), off: -0.5, len: h }, // the length, down the right-hand side
  ];
  const same = (a: number, b: number) => Math.abs(a - b) < 0.011;
  return want
    .filter((d) => d.len >= 0.3)
    .filter((d) => !(Array.isArray(existing) ? existing : []).some((o) => o.kind === "dim" && ((same(o.x1, d.x1) && same(o.y1, d.y1) && same(o.x2, d.x2) && same(o.y2, d.y2)) || (same(o.x1, d.x2) && same(o.y1, d.y2) && same(o.x2, d.x1) && same(o.y2, d.y1)))))
    .map(({ len, ...rest }) => rest);
}

// ---- layers of the person's own -----------------------------------------------------------------------------------------
// Any object can be put on a layer with a name the person chooses (Kitchen plan, Electrics...). The layer is just that name on the object, so it is saved, copied, flipped and moved with it,
// and appears in the Layers menu (to hide, rename or delete) and, by name, in the DXF export. An object on a layer of its own is on that layer INSTEAD of its usual one.
export const MAX_LAYER_NAME = 30;
export const MAX_CUSTOM_LAYERS = 20;
const BUILT_IN_NAMES = (): string[] => OBJECT_LAYERS.flatMap((l) => [l.id, l.label.toLowerCase()]);

// A valid name: letters, digits, spaces, underscores and hyphens, starting with a letter or digit, 1 to 30 characters, and not the name of a built-in layer. Anything else is null.
export function cleanLayerName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]{0,29}$/.test(t)) return null;
  return BUILT_IN_NAMES().includes(t.toLowerCase()) ? null : t;
}
export const layerKey = (o: PlanObject): string => (o.lyr ? `x:${o.lyr}` : objectLayer(o)); // what the Layers menu hides by: the built-in layer's id, or x: and the person's name
export function customLayerNames(objects: PlanObject[]): string[] {
  const seen = new Map<string, string>();
  for (const o of Array.isArray(objects) ? objects : []) if (o && typeof o.lyr === "string" && o.lyr && !seen.has(o.lyr.toLowerCase())) seen.set(o.lyr.toLowerCase(), o.lyr); // a broken entry is skipped, never an error
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
// Put the selected objects on a layer (a name), or back on their usual layer (null). Refused, with the reason, for a bad name or a 21st layer.
export function assignLayer(objects: PlanObject[], ids: string[], name: string | null): { objects: PlanObject[]; error?: string } {
  const set = new Set(Array.isArray(ids) ? ids : []);
  if (!Array.isArray(objects) || !objects.some((o) => set.has(o.id))) return { objects };
  if (name === null) return { objects: objects.map((o) => { if (!set.has(o.id) || !o.lyr) return o; const { lyr, ...rest } = o; void lyr; return rest as PlanObject; }) };
  const clean = cleanLayerName(name);
  if (!clean) return { objects, error: "A layer name uses letters, digits, spaces, _ and -, up to 30 characters, and cannot be the name of a built-in layer" };
  const existing = customLayerNames(objects);
  const known = existing.find((n) => n.toLowerCase() === clean.toLowerCase());
  if (!known && existing.length >= MAX_CUSTOM_LAYERS) return { objects, error: `A floor can have up to ${MAX_CUSTOM_LAYERS} layers of your own` };
  const use = known ?? clean;
  return { objects: objects.map((o) => (set.has(o.id) ? { ...o, lyr: use } : o)) };
}
// Rename a layer (everything on it moves to the new name; if that name is another layer of yours, they join it)
export function renameLayer(objects: PlanObject[], from: string, to: string): { objects: PlanObject[]; error?: string } {
  const clean = cleanLayerName(to);
  if (!clean) return { objects, error: "A layer name uses letters, digits, spaces, _ and -, up to 30 characters, and cannot be the name of a built-in layer" };
  const target = customLayerNames(objects).find((n) => n.toLowerCase() === clean.toLowerCase()) ?? clean;
  return { objects: objects.map((o) => (o.lyr && o.lyr.toLowerCase() === from.toLowerCase() ? { ...o, lyr: target } : o)) };
}
// Delete a layer: nothing on the plan is deleted, everything on it goes back to its usual layer
export function deleteLayer(objects: PlanObject[], name: string): PlanObject[] {
  return objects.map((o) => { if (!o.lyr || o.lyr.toLowerCase() !== name.toLowerCase()) return o; const { lyr, ...rest } = o; void lyr; return rest as PlanObject; });
}
// The layer's name in a DXF file: capitals, digits, _ and -, up to 31 characters (a space becomes _)
export function dxfLayerName(name: unknown): string {
  const t = typeof name === "string" ? name.toUpperCase().replace(/\s+/g, "_").replace(/[^A-Z0-9_-]/g, "").slice(0, 31) : "";
  return t || "CUSTOM";
}
