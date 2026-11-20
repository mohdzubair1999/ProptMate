import { parseSvg, type XNode } from "./svgSanitize";

// Turns a floor plan's saved drawing (the SAME cleaned SVG the printed sheet is made from) into a DXF file that AutoCAD, DraftSight, QCAD, LibreCAD and
// similar programs can open. Classic ASCII DXF (release 12): the most widely readable version. Units are millimetres, with the plan the same way up as on
// screen. Walls, furniture, door and window openings, and text each go on their own layer, so a surveyor can switch them on and off.
// Pure: no browser and no database. The input is cleaned SVG made of only the shapes the sanitizer lets through.

type Mat = [number, number, number, number, number, number]; // SVG's a b c d e f
const I: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;
const nums = (s: string): number[] => (s.match(NUM) || []).map(Number).filter(Number.isFinite);

export function parseTransform(t: string | undefined): Mat {
  let m: Mat = I;
  if (!t) return m;
  for (const part of t.matchAll(/(translate|rotate|scale|matrix|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const a = nums(part[2]);
    let n: Mat = I;
    if (part[1] === "translate") n = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0];
    else if (part[1] === "scale") n = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0];
    else if (part[1] === "rotate") {
      const r = ((a[0] ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
      n = [c, s, -s, c, 0, 0];
      if (a.length >= 3) n = mul(mul([1, 0, 0, 1, a[1], a[2]], n), [1, 0, 0, 1, -a[1], -a[2]]);
    } else if (part[1] === "matrix" && a.length >= 6) n = [a[0], a[1], a[2], a[3], a[4], a[5]];
    m = mul(m, n);
  }
  return m;
}

// ---- paths, flattened into straight pieces ----
type Poly = { pts: [number, number][]; closed: boolean };
const MAX_PTS = 20000;

function arcPoints(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): [number, number][] {
  rx = Math.abs(rx); ry = Math.abs(ry);
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [[x2, y2]];
  const phi = (phiDeg * Math.PI) / 180, cp = Math.cos(phi), sp = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = cp * dx + sp * dy, y1p = -sp * dx + cp * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den)), cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cp * cxp - sp * cyp + (x1 + x2) / 2, cy = sp * cxp + cp * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dth > 0) dth -= 2 * Math.PI; else if (sweep && dth < 0) dth += 2 * Math.PI;
  const steps = Math.max(4, Math.ceil(Math.abs(dth) / (Math.PI / 18)));
  const out: [number, number][] = [];
  for (let i = 1; i <= steps; i++) { const t = th1 + (dth * i) / steps, ct = Math.cos(t), st = Math.sin(t); out.push([cp * rx * ct - sp * ry * st + cx, sp * rx * ct + cp * ry * st + cy]); }
  out[out.length - 1] = [x2, y2];
  return out;
}

export function flattenPath(d: string): Poly[] {
  const out: Poly[] = [];
  let i = 0, cmd = "", cur = null as Poly | null, x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lastC = "";
  const len = d.length;
  const skip = () => { while (i < len && /[\s,]/.test(d[i])) i++; };
  const readNum = (): number | null => { skip(); const re = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y; re.lastIndex = i; const m = re.exec(d); if (!m) return null; i = re.lastIndex; const v = Number(m[0]); return Number.isFinite(v) ? v : null; };
  const readFlag = (): number | null => { skip(); if (d[i] === "0" || d[i] === "1") return Number(d[i++]); return null; };
  const start = (px: number, py: number) => { cur = { pts: [[px, py]], closed: false }; out.push(cur); };
  let total = 0;
  const add = (px: number, py: number) => { if (!cur) start(x, y); cur!.pts.push([px, py]); total++; };
  const need = (n: number) => { const v: number[] = []; for (let k = 0; k < n; k++) { const r = readNum(); if (r === null) return null; v.push(r); } return v; };
  while (i < len && total < MAX_PTS) {
    skip();
    if (i >= len) break;
    if (/[A-Za-z]/.test(d[i])) cmd = d[i++]; else if (!cmd) break;
    const up = cmd.toUpperCase(), rel = cmd !== up;
    if (up === "Z") { if (cur) { cur.closed = true; x = sx; y = sy; } cur = null; cmd = "Z"; continue; }
    if (up === "M") { const v = need(2); if (!v) break; x = rel ? x + v[0] : v[0]; y = rel ? y + v[1] : v[1]; sx = x; sy = y; start(x, y); cmd = rel ? "l" : "L"; lastC = ""; continue; }
    if (up === "L") { const v = need(2); if (!v) break; x = rel ? x + v[0] : v[0]; y = rel ? y + v[1] : v[1]; add(x, y); lastC = ""; continue; }
    if (up === "H") { const v = need(1); if (!v) break; x = rel ? x + v[0] : v[0]; add(x, y); lastC = ""; continue; }
    if (up === "V") { const v = need(1); if (!v) break; y = rel ? y + v[0] : v[0]; add(x, y); lastC = ""; continue; }
    if (up === "C" || up === "S") {
      const v = need(up === "C" ? 6 : 4); if (!v) break;
      let x1, y1, x2, y2, ex, ey;
      if (up === "C") { [x1, y1, x2, y2, ex, ey] = v; } else { x1 = lastC === "C" ? 2 * x - lcx : x; y1 = lastC === "C" ? 2 * y - lcy : y; [x2, y2, ex, ey] = v; if (rel) { x2 += x; y2 += y; ex += x; ey += y; } }
      if (rel && up === "C") { x1 += x; y1 += y; x2 += x; y2 += y; ex += x; ey += y; }
      for (let k = 1; k <= 12; k++) { const t = k / 12, u = 1 - t; add(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex, u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey); }
      lcx = x2; lcy = y2; x = ex; y = ey; lastC = "C"; continue;
    }
    if (up === "Q" || up === "T") {
      const v = need(up === "Q" ? 4 : 2); if (!v) break;
      let qx, qy, ex, ey;
      if (up === "Q") { [qx, qy, ex, ey] = v; if (rel) { qx += x; qy += y; ex += x; ey += y; } } else { qx = lastC === "Q" ? 2 * x - lcx : x; qy = lastC === "Q" ? 2 * y - lcy : y; [ex, ey] = v; if (rel) { ex += x; ey += y; } }
      for (let k = 1; k <= 10; k++) { const t = k / 10, u = 1 - t; add(u * u * x + 2 * u * t * qx + t * t * ex, u * u * y + 2 * u * t * qy + t * t * ey); }
      lcx = qx; lcy = qy; x = ex; y = ey; lastC = "Q"; continue;
    }
    if (up === "A") {
      const a = need(3); if (!a) break; const la = readFlag(), sw = readFlag(); if (la === null || sw === null) break; const e = need(2); if (!e) break;
      const ex = rel ? x + e[0] : e[0], ey = rel ? y + e[1] : e[1];
      for (const p of arcPoints(x, y, a[0], a[1], a[2], la === 1, sw === 1, ex, ey)) add(p[0], p[1]);
      x = ex; y = ey; lastC = ""; continue;
    }
    break; // an unknown command: stop here and keep what was read
  }
  return out.filter((p) => p.pts.length >= 2);
}

// ---- layers ----
export const DXF_LAYERS = { WALLS: 7, FURNITURE: 30, OPENINGS: 1, TEXT: 2, PLAN: 8, DIMENSIONS: 4 } as const;
type LayerName = keyof typeof DXF_LAYERS;
const STROKE_LAYER: Record<string, LayerName> = { "#25344a": "WALLS", "#8b7355": "FURNITURE", "#0e7490": "DIMENSIONS" }; // a dimension is drawn in its own colour, so its lines (and, below, its text) get a layer of their own
const NONE = (v: string | undefined) => v === undefined || v === "none" || v === "transparent";
// The plan paints a door or window gap as a rectangle in the PAPER colour over the wall. Only that is an opening. Any other mark that has a fill but
// no outline (the north arrow, a door's hinge dot) is an ordinary annotation, and goes on the PLAN layer.
const PAPER = "#fbf8f4";

type Ctx = { m: Mat; stroke?: string; fill?: string; size?: number; anchor?: string; dxfLayer?: string };
const cleanDxfLayer = (v: string | undefined): string | undefined => (typeof v === "string" && /^[A-Z0-9_-]{1,31}$/.test(v) ? v : undefined); // a layer name set on an object's group by the editor
export type DxfEntity =
  | { kind: "line"; layer: string; a: [number, number]; b: [number, number] }
  | { kind: "poly"; layer: string; pts: [number, number][]; closed: boolean }
  | { kind: "circle"; layer: string; c: [number, number]; r: number }
  | { kind: "text"; layer: string; at: [number, number]; h: number; value: string; rot: number; align: 0 | 1 | 2 };

const textOf = (n: XNode): string => (n.text || "") + n.children.map(textOf).join("");
// whitespace (including line breaks) becomes a single space FIRST, then anything that is not plain printable text is dropped
const ascii = (s: string) => s.replace(/\s+/g, " ").replace(/²/g, "2").replace(/³/g, "3").replace(/°/g, "%%d").replace(/±/g, "%%p").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^\x20-\x7E]/g, "").replace(/ +/g, " ").trim();

export type DxfOptions = { pxPerMetre: number; originPx: number; title?: string; layerColours?: Record<string, number> }; // layerColours: a layer of the person's own -> its standard colour number
const MAX_ENTITIES = 20000, MAX_DEPTH = 40;

// ---- openings: the wall is cut where a door or window gap is painted over it ----
// On the plan a door or window is a paper-coloured rectangle laid over the wall. A CAD file cannot "paint over", so here the wall outline is actually cut
// open there: the parts of each wall inside an opening are removed and what is left is rejoined into polylines. The opening's outline stays on its own layer.
type Pt = [number, number];
const EPS = 1e-9;

// The part of the segment A->B (as t from 0 to 1) that lies inside a convex polygon (Cyrus-Beck clipping), or null if none.
function insideInterval(a: Pt, b: Pt, poly: Pt[]): [number, number] | null {
  let area = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; area += p[0] * q[1] - q[0] * p[1]; }
  if (Math.abs(area) < EPS) return null;
  const q = area > 0 ? poly : [...poly].reverse(); // counter-clockwise, so the inside is on the left of every edge
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length];
    const nx = -(r[1] - p[1]), ny = r[0] - p[0]; // inward normal
    const num = nx * (a[0] - p[0]) + ny * (a[1] - p[1]), den = nx * dx + ny * dy;
    // parallel to this edge: only a segment strictly INSIDE it counts. One lying exactly along the edge (a wall that merely touches the gap) is not cut, decided here
    // by a small margin rather than by rounding luck.
    if (Math.abs(den) < EPS) { if (num <= 1e-7) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return t1 - t0 > EPS ? [t0, t1] : null;
}

// the parts of A->B outside every opening, as intervals of t
function keptIntervals(a: Pt, b: Pt, openings: Pt[][]): [number, number][] {
  const cuts: [number, number][] = [];
  for (const o of openings) { const iv = insideInterval(a, b, o); if (iv) cuts.push(iv); }
  if (cuts.length === 0) return [[0, 1]];
  cuts.sort((x, y) => x[0] - y[0]);
  const kept: [number, number][] = []; let at = 0;
  for (const [c0, c1] of cuts) { if (c0 - at > EPS) kept.push([at, c0]); at = Math.max(at, c1); }
  if (1 - at > EPS) kept.push([at, 1]);
  return kept;
}

// One wall outline (open or closed) cut by the openings: the pieces that remain, or the original untouched if nothing was cut
function cutPolyline(pts: Pt[], closed: boolean, openings: Pt[][]): { pts: Pt[]; closed: boolean }[] {
  const n = pts.length, m = closed ? n : n - 1;
  const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const chains: Pt[][] = []; let cur: Pt[] | null = null, cutAny = false, firstStartsAtStart = false;
  for (let i = 0; i < m; i++) {
    const A = pts[i], B = pts[(i + 1) % n];
    if (Math.hypot(B[0] - A[0], B[1] - A[1]) < EPS) continue;
    const kept = keptIntervals(A, B, openings);
    if (kept.length !== 1 || kept[0][0] > EPS || kept[0][1] < 1 - EPS) cutAny = true;
    if (kept.length === 0 || kept[0][0] > EPS) cur = null; // the wall is cut right at the start of this segment
    for (const [t0, t1] of kept) {
      if (t0 <= EPS && cur) cur.push(lerp(A, B, t1));
      else { cur = [lerp(A, B, t0), lerp(A, B, t1)]; chains.push(cur); if (i === 0 && t0 <= EPS) firstStartsAtStart = true; }
      if (t1 < 1 - EPS) cur = null; // cut at the end of this piece: the next piece starts a new line
    }
  }
  if (!cutAny) return [{ pts, closed }];
  if (closed && cur && firstStartsAtStart && chains.length > 1) { const last = chains.pop()!; chains[0] = last.concat(chains[0].slice(1)); } // the pieces either side of the start vertex are one line
  return chains.filter((c) => c.length >= 2).map((c) => ({ pts: c, closed: false }));
}

// Every wall (a polyline or line on the WALLS layer), cut by every opening outline (a closed 4-corner shape on the OPENINGS layer). Order is kept.
function cutOpenings(ents: DxfEntity[]): DxfEntity[] {
  const openings = ents.filter((e): e is Extract<DxfEntity, { kind: "poly" }> => e.kind === "poly" && e.layer === "OPENINGS" && e.closed && e.pts.length === 4).map((e) => e.pts as Pt[]);
  if (openings.length === 0) return ents;
  const out: DxfEntity[] = [];
  for (const e of ents) {
    if (e.layer !== "WALLS" || (e.kind !== "poly" && e.kind !== "line")) { out.push(e); continue; }
    const pieces = cutPolyline(e.kind === "line" ? [e.a, e.b] : (e.pts as Pt[]), e.kind === "line" ? false : e.closed, openings);
    for (const pc of pieces) {
      if (e.kind === "line" && pc.pts.length === 2) out.push({ kind: "line", layer: e.layer, a: pc.pts[0], b: pc.pts[1] });
      else out.push({ kind: "poly", layer: e.layer, pts: pc.pts, closed: pc.closed });
    }
  }
  return out;
}

export function svgToEntities(innerSvg: string, opt: DxfOptions): DxfEntity[] {
  const root = typeof innerSvg === "string" ? parseSvg(`<svg>${innerSvg}</svg>`) : null;
  if (!root) return [];
  const ppm = Number.isFinite(opt.pxPerMetre) && opt.pxPerMetre > 0 ? opt.pxPerMetre : 40, origin = Number.isFinite(opt.originPx) ? opt.originPx : 10;
  // px in the drawing -> millimetres on the plan, the plan the same way up as on screen (DXF's Y axis points up)
  const toMm = (px: number, py: number): [number, number] => [((px - origin) / ppm) * 1000, (-(py - origin) / ppm) * 1000];
  const ents: DxfEntity[] = [];
  const pxScale = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const layerFor = (c: Ctx, isMask: boolean): string => (isMask ? "OPENINGS" : c.dxfLayer ?? STROKE_LAYER[(c.stroke || "").toLowerCase()] ?? "PLAN");
  const walk = (n: XNode, ctx: Ctx, depth: number) => {
    if (depth > MAX_DEPTH || ents.length >= MAX_ENTITIES) return;
    const a = n.attrs;
    const c: Ctx = { m: a.transform ? mul(ctx.m, parseTransform(a.transform)) : ctx.m, dxfLayer: cleanDxfLayer(a["data-dxf-layer"]) ?? ctx.dxfLayer, stroke: a.stroke ?? ctx.stroke, fill: a.fill ?? ctx.fill, size: a["font-size"] ? Number(a["font-size"]) || ctx.size : ctx.size, anchor: a["text-anchor"] ?? ctx.anchor };
    const n0 = (k: string) => { const v = Number(a[k]); return Number.isFinite(v) ? v : 0; };
    const stroked = !NONE(c.stroke), filled = !NONE(c.fill);
    const isMask = !stroked && filled && (c.fill || "").toLowerCase() === PAPER; // a painted-over gap in a wall (a door or window opening): kept as an outline on its own layer
    const fillOnly = !stroked && filled && !isMask && !/^url\(/i.test(c.fill || ""); // a solid mark with no outline: drawn as its outline, on the PLAN layer
    const visible = stroked || isMask || fillOnly;
    const layerOf = (): string => (isMask ? "OPENINGS" : c.dxfLayer ?? (fillOnly ? "PLAN" : layerFor(c, false)));
    const draw = (pts: [number, number][], closed: boolean) => { if (pts.length < 2 || !visible) return; ents.push({ kind: "poly", layer: layerOf(), pts: pts.map(([x, y]) => toMm(...apply(c.m, x, y))), closed }); };
    switch (n.tag) {
      case "g": case "svg": break;
      case "line": { if (!stroked) return; ents.push({ kind: "line", layer: layerFor(c, false), a: toMm(...apply(c.m, n0("x1"), n0("y1"))), b: toMm(...apply(c.m, n0("x2"), n0("y2"))) }); return; }
      case "rect": { const x = n0("x"), y = n0("y"), w = n0("width"), h = n0("height"); if (w > 0 && h > 0) draw([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true); return; }
      case "polygon": case "polyline": { const v = nums(a.points || ""); const pts: [number, number][] = []; for (let k = 0; k + 1 < v.length; k += 2) pts.push([v[k], v[k + 1]]); draw(pts, n.tag === "polygon"); return; }
      case "circle": case "ellipse": {
        const cx = n0("cx"), cy = n0("cy"), rx = n.tag === "circle" ? n0("r") : n0("rx"), ry = n.tag === "circle" ? n0("r") : n0("ry");
        if (!(rx > 0 && ry > 0) || !visible) return;
        const similar = Math.abs(Math.hypot(c.m[0], c.m[1]) - Math.hypot(c.m[2], c.m[3])) < 1e-6 && Math.abs(c.m[0] * c.m[2] + c.m[1] * c.m[3]) < 1e-6;
        if (rx === ry && similar) { ents.push({ kind: "circle", layer: layerOf(), c: toMm(...apply(c.m, cx, cy)), r: ((rx * pxScale(c.m)) / ppm) * 1000 }); return; }
        const pts: [number, number][] = []; for (let k = 0; k < 48; k++) { const t = (k / 48) * Math.PI * 2; pts.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]); }
        draw(pts, true); return;
      }
      case "path": { for (const p of flattenPath(a.d || "")) draw(p.pts, p.closed); return; }
      case "text": {
        const value = ascii(textOf(n)); if (!value) return;
        const x = n0("x"), y = n0("y"), size = (c.size ?? 12) * pxScale(c.m), rot = (Math.atan2(c.m[1], c.m[0]) * 180) / Math.PI;
        ents.push({ kind: "text", layer: c.dxfLayer ?? ((c.fill || "").toLowerCase() === "#0e7490" ? "DIMENSIONS" : "TEXT"), at: toMm(...apply(c.m, x, y)), h: Math.max(1, (size / ppm) * 1000 * 0.8), value, rot: Math.round(-rot * 100) / 100, align: c.anchor === "middle" ? 1 : c.anchor === "end" ? 2 : 0 });
        return;
      }
      default: return; // anything else is not drawn
    }
    for (const ch of n.children) walk(ch, c, depth + 1);
  };
  walk(root, { m: I }, 0);
  return cutOpenings(ents);
}

// ---- writing the file ----
const f = (v: number) => (Number.isFinite(v) ? (Math.round(v * 100) / 100).toString() : "0");
const g = (code: number, value: string | number) => `${code}\n${value}\n`;

// the entities as a file; `layerOrder` is the layers in the order they are listed, `colourOf` gives each one's standard colour number
function writeDxf(ents: DxfEntity[], layerOrder: string[], colourOf: (layer: string) => number, title?: string): string {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (p: [number, number]) => { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); };
  for (const e of ents) { if (e.kind === "line") { grow(e.a); grow(e.b); } else if (e.kind === "poly") e.pts.forEach(grow); else if (e.kind === "circle") { grow([e.c[0] - e.r, e.c[1] - e.r]); grow([e.c[0] + e.r, e.c[1] + e.r]); } else grow(e.at); }
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
  let s = "";
  s += g(999, ascii(`ProptMate floor plan${title ? `: ${title}` : ""}. Units: millimetres.`).slice(0, 200));
  s += g(0, "SECTION") + g(2, "HEADER") + g(9, "$ACADVER") + g(1, "AC1009") + g(9, "$EXTMIN") + g(10, f(minX)) + g(20, f(minY)) + g(30, 0) + g(9, "$EXTMAX") + g(10, f(maxX)) + g(20, f(maxY)) + g(30, 0) + g(0, "ENDSEC");
  s += g(0, "SECTION") + g(2, "TABLES");
  s += g(0, "TABLE") + g(2, "LTYPE") + g(70, 1) + g(0, "LTYPE") + g(2, "CONTINUOUS") + g(70, 0) + g(3, "Solid line") + g(72, 65) + g(73, 0) + g(40, 0) + g(0, "ENDTAB");
  s += g(0, "TABLE") + g(2, "LAYER") + g(70, layerOrder.length);
  for (const l of layerOrder) s += g(0, "LAYER") + g(2, l) + g(70, 0) + g(62, colourOf(l)) + g(6, "CONTINUOUS");
  s += g(0, "ENDTAB");
  s += g(0, "TABLE") + g(2, "STYLE") + g(70, 1) + g(0, "STYLE") + g(2, "STANDARD") + g(70, 0) + g(40, 0) + g(41, 1) + g(50, 0) + g(71, 0) + g(42, 2.5) + g(3, "txt") + g(4, "") + g(0, "ENDTAB");
  s += g(0, "ENDSEC") + g(0, "SECTION") + g(2, "ENTITIES");
  for (const e of ents) {
    if (e.kind === "line") s += g(0, "LINE") + g(8, e.layer) + g(10, f(e.a[0])) + g(20, f(e.a[1])) + g(30, 0) + g(11, f(e.b[0])) + g(21, f(e.b[1])) + g(31, 0);
    else if (e.kind === "circle") s += g(0, "CIRCLE") + g(8, e.layer) + g(10, f(e.c[0])) + g(20, f(e.c[1])) + g(30, 0) + g(40, f(e.r));
    else if (e.kind === "poly") { s += g(0, "POLYLINE") + g(8, e.layer) + g(66, 1) + g(10, 0) + g(20, 0) + g(30, 0) + g(70, e.closed ? 1 : 0); for (const p of e.pts) s += g(0, "VERTEX") + g(8, e.layer) + g(10, f(p[0])) + g(20, f(p[1])) + g(30, 0); s += g(0, "SEQEND") + g(8, e.layer); }
    else { s += g(0, "TEXT") + g(8, e.layer) + g(10, f(e.at[0])) + g(20, f(e.at[1])) + g(30, 0) + g(40, f(e.h)) + g(1, e.value) + g(50, f(e.rot)); if (e.align) s += g(72, e.align) + g(11, f(e.at[0])) + g(21, f(e.at[1])) + g(31, 0); }
  }
  return s + g(0, "ENDSEC") + g(0, "EOF");
}

export function svgToDxf(innerSvg: string, opt: DxfOptions): string {
  const ents = svgToEntities(innerSvg, opt);
  const used = new Set(ents.map((e) => e.layer));
  const builtIn: string[] = (Object.keys(DXF_LAYERS) as LayerName[]).filter((l) => used.size === 0 || used.has(l));
  const custom = [...used].filter((l) => !(l in DXF_LAYERS)).sort(); // layers of the person's own are listed too, by name
  return writeDxf(ents, [...builtIn, ...custom], (l) => opt.layerColours?.[l] ?? DXF_LAYERS[l as LayerName] ?? 7, opt.title);
}

// ---- several floors in ONE file ----
export type DxfFloor = { name: string; innerSvg: string; pxPerMetre: number; originPx: number; layerColours?: Record<string, number> };
export const FLOOR_GAP_MM = 5000; // clear space between one floor and the next
const MAX_FLOORS = 12;
const layerSlug = (name: string, taken: Set<string>, index: number): string => {
  let base = ascii(String(name ?? "")).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18) || `FLOOR${index + 1}`;
  let slug = base, n = 2;
  while (taken.has(slug)) slug = `${base.slice(0, 15)}_${n++}`;
  taken.add(slug);
  return slug;
};
const shift = (e: DxfEntity, dx: number, dy: number): DxfEntity =>
  e.kind === "line" ? { ...e, a: [e.a[0] + dx, e.a[1] + dy], b: [e.b[0] + dx, e.b[1] + dy] } : e.kind === "poly" ? { ...e, pts: e.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : e.kind === "circle" ? { ...e, c: [e.c[0] + dx, e.c[1] + dy] } : { ...e, at: [e.at[0] + dx, e.at[1] + dy] };
function boundsOf(ents: DxfEntity[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (x: number, y: number) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); };
  for (const e of ents) { if (e.kind === "line") { grow(...e.a); grow(...e.b); } else if (e.kind === "poly") e.pts.forEach((p) => grow(p[0], p[1])); else if (e.kind === "circle") { grow(e.c[0] - e.r, e.c[1] - e.r); grow(e.c[0] + e.r, e.c[1] + e.r); } else grow(e.at[0], e.at[1]); }
  return { minX, minY, maxX, maxY };
}

// Every floor of a property in one DXF: the floors sit side by side (left to right, in order, with a clear gap), each on its OWN layers named after the floor
// (GROUND_FLOOR_WALLS, FIRST_FLOOR_WALLS ...), each labelled with its name, so a CAD user can show or hide a whole floor at a time.
export function svgsToDxf(floors: DxfFloor[], title?: string): string {
  const ents: DxfEntity[] = [], order: string[] = [], colours = new Map<string, number>(), taken = new Set<string>();
  let cursor = 0, count = 0;
  for (const fl of (Array.isArray(floors) ? floors : []).slice(0, MAX_FLOORS)) {
    if (!fl || typeof fl !== "object") continue;
    const one = svgToEntities(fl.innerSvg, { pxPerMetre: fl.pxPerMetre, originPx: fl.originPx });
    if (one.length === 0) continue; // a floor with nothing drawn takes no space and no layers
    const slug = layerSlug(fl.name, taken, count++);
    const b = boundsOf(one), dx = cursor - b.minX;
    for (const e of one) {
      const layer = `${slug}_${e.layer}`;
      if (!colours.has(layer)) { colours.set(layer, fl.layerColours?.[e.layer] ?? DXF_LAYERS[e.layer as LayerName] ?? 7); order.push(layer); }
      ents.push({ ...shift(e, dx, 0), layer });
    }
    const label = ascii(String(fl.name ?? "")) || `Floor ${count}`;
    const tl = `${slug}_TEXT`;
    if (!colours.has(tl)) { colours.set(tl, DXF_LAYERS.TEXT); order.push(tl); }
    ents.push({ kind: "text", layer: tl, at: [cursor, b.maxY + 700], h: 350, value: label.slice(0, 80), rot: 0, align: 0 });
    cursor += b.maxX - b.minX + FLOOR_GAP_MM;
  }
  return writeDxf(ents, order, (l) => colours.get(l) ?? 7, title);
}
