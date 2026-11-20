import { MAX_OBJECTS, cleanLabelText, type PlanObject } from "./floorPlanObjects";

// Reading a DXF drawing (the text form, from AutoCAD and most CAD programs) into the plan: lines and polylines become walls, text becomes labels. Pure (no screen, no browser,
// no upload), so every rule is tested directly. A DXF is a list of (code, value) pairs; only what the plan can hold is read, and everything else is counted so the person is told.

type Pt = { x: number; y: number };
export type DxfEntity =
  | { type: "LINE"; layer: string; a: Pt; b: Pt }
  | { type: "POLY"; layer: string; pts: Pt[]; closed: boolean }
  | { type: "TEXT"; layer: string; at: Pt; height: number; rot: number; value: string };
export type DxfParsed = { entities: DxfEntity[]; insunits: number | null; skipped: Record<string, number> };

export const MAX_DXF_CHARS = 8_000_000; // a drawing bigger than this is refused (it would not be a floor plan)
const num = (v: string): number | null => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// MTEXT carries formatting codes: {\fArial;text}, \P for a new line, \~ for a space...
function cleanMtext(s: string): string {
  return s.replace(/\\[Pp]/g, " ").replace(/\\~/g, " ").replace(/\\[A-Za-z][^;\\{}]*;/g, "").replace(/\\\\/g, "\\").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

export function parseDxf(text: unknown): DxfParsed {
  const out: DxfParsed = { entities: [], insunits: null, skipped: {} };
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_DXF_CHARS) return out;
  const lines = text.split(/\r?\n/);
  const pairs: [number, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) { const c = Number(lines[i].trim()); if (Number.isInteger(c)) pairs.push([c, lines[i + 1].trim()]); else { i -= 1; } } // an odd line (a stray blank) shifts the pairing back by one
  let section = "", i = 0;
  const skip = (t: string) => { out.skipped[t] = (out.skipped[t] ?? 0) + 1; };
  while (i < pairs.length) {
    const [c, v] = pairs[i];
    if (c === 0 && v === "SECTION") { section = pairs[i + 1]?.[0] === 2 ? pairs[i + 1][1] : ""; i += 2; continue; }
    if (c === 0 && v === "ENDSEC") { section = ""; i++; continue; }
    if (section === "HEADER" && c === 9 && v === "$INSUNITS" && pairs[i + 1]?.[0] === 70) { out.insunits = num(pairs[i + 1][1]); i += 2; continue; }
    if (section === "BLOCKS") { if (c === 0 && v === "INSERT") skip("INSERT"); i++; continue; } // blocks (symbols) are not read
    if (section !== "ENTITIES" || c !== 0) { i++; continue; }
    // one entity: its pairs up to the next code 0
    const type = v; let j = i + 1; const body: [number, string][] = [];
    while (j < pairs.length && pairs[j][0] !== 0) body.push(pairs[j++]);
    const get = (code: number): string | undefined => body.find((p) => p[0] === code)?.[1];
    const layer = get(8) ?? "0";
    const pt = (cx: number, cy: number): Pt | null => { const x = num(get(cx) ?? ""), y = num(get(cy) ?? ""); return x === null || y === null ? null : { x, y }; };
    if (type === "LINE") {
      const a = pt(10, 20), b = pt(11, 21);
      if (a && b) out.entities.push({ type: "LINE", layer, a, b }); else skip("LINE");
    } else if (type === "LWPOLYLINE") {
      const pts: Pt[] = []; let x: number | null = null;
      for (const [code, val] of body) { if (code === 10) x = num(val); else if (code === 20 && x !== null) { const y = num(val); if (y !== null) pts.push({ x, y }); x = null; } }
      const flags = num(get(70) ?? "0") ?? 0;
      if (pts.length >= 2) out.entities.push({ type: "POLY", layer, pts, closed: (flags & 1) === 1 }); else skip("LWPOLYLINE");
    } else if (type === "POLYLINE") {
      // the old form: the corners follow as VERTEX entities, up to SEQEND
      const flags = num(get(70) ?? "0") ?? 0; const pts: Pt[] = []; let k = j;
      while (k < pairs.length) {
        if (pairs[k][0] === 0 && pairs[k][1] === "VERTEX") { let m = k + 1; let vx: number | null = null, vy: number | null = null; while (m < pairs.length && pairs[m][0] !== 0) { if (pairs[m][0] === 10) vx = num(pairs[m][1]); else if (pairs[m][0] === 20) vy = num(pairs[m][1]); m++; } if (vx !== null && vy !== null) pts.push({ x: vx, y: vy }); k = m; continue; }
        if (pairs[k][0] === 0 && pairs[k][1] === "SEQEND") { k++; while (k < pairs.length && pairs[k][0] !== 0) k++; break; }
        if (pairs[k][0] === 0) break;
        k++;
      }
      if (pts.length >= 2) out.entities.push({ type: "POLY", layer, pts, closed: (flags & 1) === 1 }); else skip("POLYLINE");
      i = k; continue;
    } else if (type === "TEXT" || type === "MTEXT") {
      const at = pt(10, 20), raw = type === "MTEXT" ? body.filter((p) => p[0] === 3).map((p) => p[1]).join("") + (get(1) ?? "") : get(1) ?? "";
      const value = type === "MTEXT" ? cleanMtext(raw) : raw.replace(/%%[A-Za-z]/g, "").trim();
      if (at && value) out.entities.push({ type: "TEXT", layer, at, height: num(get(40) ?? "") ?? 0, rot: num(get(50) ?? "0") ?? 0, value }); else skip(type);
    } else if (type !== "VERTEX" && type !== "SEQEND") skip(type);
    i = j;
  }
  return out;
}

export type DxfUnit = "auto" | "mm" | "cm" | "m";
export type ImportStats = { walls: number; labels: number; unit: "mm" | "cm" | "m"; unitGuessed: boolean; widthM: number; heightM: number; truncated: number; skipped: Record<string, number>; error?: string };
const INSUNITS: Record<number, "mm" | "cm" | "m"> = { 4: "mm", 5: "cm", 6: "m" };
const FACTOR = { mm: 0.001, cm: 0.01, m: 1 } as const;
const MARGIN = 0.5; // the drawing is moved so its top left corner sits half a metre in from the plan's corner
export const MAX_DXF_LABELS = 100;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// Lines and polylines become walls (the longest ones if there are too many), text becomes labels. The drawing is turned so that north is up on the plan (a DXF's y
// runs upward, the plan's runs down) and moved to the top left. The objects come back without ids: the caller gives them their own.
export function dxfToPlanObjects(parsed: DxfParsed, opts: { unit?: DxfUnit; room?: number } = {}): { objects: PlanObject[]; stats: ImportStats } {
  const segs: { a: Pt; b: Pt }[] = [];
  for (const e of parsed?.entities ?? []) {
    if (e.type === "LINE") segs.push({ a: e.a, b: e.b });
    else if (e.type === "POLY") { for (let k = 0; k + 1 < e.pts.length; k++) segs.push({ a: e.pts[k], b: e.pts[k + 1] }); if (e.closed && e.pts.length > 2) segs.push({ a: e.pts[e.pts.length - 1], b: e.pts[0] }); }
  }
  const texts = (parsed?.entities ?? []).filter((e): e is Extract<DxfEntity, { type: "TEXT" }> => e.type === "TEXT");
  const stats: ImportStats = { walls: 0, labels: 0, unit: "m", unitGuessed: false, widthM: 0, heightM: 0, truncated: 0, skipped: { ...(parsed?.skipped ?? {}) } };
  const all = [...segs.flatMap((s) => [s.a, s.b]), ...texts.map((t) => t.at)];
  if (all.length === 0) return { objects: [], stats };
  const minX = Math.min(...all.map((p) => p.x)), maxX = Math.max(...all.map((p) => p.x)), minY = Math.min(...all.map((p) => p.y)), maxY = Math.max(...all.map((p) => p.y));
  const extent = Math.max(maxX - minX, maxY - minY);
  // the units: as chosen, else as the file says, else a guess from how big the drawing is (a house 10 m across is 10, 1,000 or 10,000)
  const guess = (): "mm" | "cm" | "m" => (extent > 2000 ? "mm" : extent > 100 ? "cm" : "m");
  let unit: "mm" | "cm" | "m";
  if (opts.unit && opts.unit !== "auto") unit = opts.unit;
  else if (parsed.insunits !== null && INSUNITS[parsed.insunits] && extent * FACTOR[INSUNITS[parsed.insunits]] <= 150) unit = INSUNITS[parsed.insunits];
  else { unit = guess(); stats.unitGuessed = true; } // no units in the file, or the file's units (often a template's default) would make the drawing absurdly big: go by its size instead
  stats.unit = unit;
  const k = FACTOR[unit];
  stats.widthM = r3((maxX - minX) * k); stats.heightM = r3((maxY - minY) * k);
  if (stats.widthM > 150 || stats.heightM > 150) { stats.error = `The drawing would be ${stats.widthM} m by ${stats.heightM} m in ${unit}: choose a different unit`; return { objects: [], stats }; }
  const X = (x: number) => r3((x - minX) * k + MARGIN), Y = (y: number) => r3((maxY - y) * k + MARGIN);
  // walls: no tiny ones, no repeats, the longest first
  const seen = new Set<string>(), walls: { x1: number; y1: number; x2: number; y2: number; len: number }[] = [];
  for (const s of segs) {
    const w = { x1: X(s.a.x), y1: Y(s.a.y), x2: X(s.b.x), y2: Y(s.b.y), len: 0 };
    w.len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
    if (w.len < 0.05) continue;
    const key = [`${w.x1},${w.y1}`, `${w.x2},${w.y2}`].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key); walls.push(w);
  }
  const room = Math.max(0, Math.min(MAX_OBJECTS, opts.room ?? MAX_OBJECTS));
  const labelRoom = Math.min(MAX_DXF_LABELS, texts.length, room);
  const keep = walls.sort((a, b) => b.len - a.len).slice(0, Math.max(0, room - labelRoom));
  stats.truncated = walls.length - keep.length;
  const objects: PlanObject[] = keep.map((w) => ({ id: "", kind: "wall", x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, t: 0.1 }));
  stats.walls = keep.length;
  for (const t of texts.slice(0, labelRoom)) {
    const text = cleanLabelText(t.value);
    if (!text) continue;
    const rot = ((Math.round(-t.rot) % 360) + 360) % 360;
    objects.push({ id: "", kind: "label", x: X(t.at.x), y: Y(t.at.y), text, size: 12, rot });
    stats.labels++;
  }
  return { objects, stats };
}
