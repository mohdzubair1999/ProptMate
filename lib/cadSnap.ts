import { constrainPoint, lineAngleDeg, pointAtDistance, type DrawMode, type Pt } from "./customRoomShape";

// Precise drawing helpers, in the way CAD programs work: object snaps (to an endpoint, a midpoint or an intersection of what is already drawn), ortho and polar
// angle locking, and typing an exact length. Pure (no screen, no browser), so every rule is tested directly. Lengths are in metres; angles are as a CAD
// readout shows them (0 = east, 90 = north).

export type SnapKind = "endpoint" | "midpoint" | "intersection" | "perpendicular" | "parallel" | "ortho" | "polar" | "grid";
export type Anchor = { p: Pt; kind: "endpoint" | "midpoint" | "intersection" };
export type Seg = { a: Pt; b: Pt };
export type WallPointResult = { p: Pt; kind: SnapKind; label: string };

export const SNAP_LABEL: Record<SnapKind, string> = { endpoint: "Endpoint", midpoint: "Midpoint", intersection: "Intersection", perpendicular: "Perpendicular", parallel: "Parallel", ortho: "Ortho", polar: "Polar 45°", grid: "Grid" };
export const isObjectSnap = (k: SnapKind): boolean => k === "endpoint" || k === "midpoint" || k === "intersection" || k === "perpendicular" || k === "parallel";
export const MAX_TYPED_LENGTH_M = 60;
const EPS = 1e-6;
const rnd = (v: number, d: number) => { const f = 10 ** d; return Math.round(v * f) / f; };
const ok = (p: unknown): p is Pt => !!p && typeof p === "object" && Number.isFinite((p as Pt).x) && Number.isFinite((p as Pt).y);

// where two segments cross (a T-junction, where one ends on the other, counts), or null when they are parallel or do not meet
export function segmentIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return { x: rnd(a.x + t * rx, 6), y: rnd(a.y + t * ry, 6) };
}

const PRIORITY: Record<Anchor["kind"], number> = { endpoint: 0, intersection: 1, midpoint: 2 };
const MAX_PAIRS = 250_000; // a limit on how many pairs of lines are tested for crossings, so a very busy plan stays quick

// Every point worth snapping to: the ends and middles of walls, the corners and edge middles of rooms, and where walls cross each other or a room's edge
export function buildAnchors(input: { walls?: Seg[]; polygons?: Pt[][] }): Anchor[] {
  const walls = (Array.isArray(input?.walls) ? input.walls : []).filter((s) => s && ok(s.a) && ok(s.b));
  const polys = (Array.isArray(input?.polygons) ? input.polygons : []).map((poly) => (Array.isArray(poly) ? poly.filter(ok) : [])).filter((poly) => poly.length >= 2);
  const edges: Seg[] = [];
  for (const poly of polys) for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if (Math.hypot(b.x - a.x, b.y - a.y) > EPS) edges.push({ a, b }); }
  const found = new Map<string, Anchor>();
  const add = (p: Pt, kind: Anchor["kind"]) => {
    const key = `${rnd(p.x, 3)}|${rnd(p.y, 3)}`;
    const have = found.get(key);
    if (!have || PRIORITY[kind] < PRIORITY[have.kind]) found.set(key, { p: { x: rnd(p.x, 6), y: rnd(p.y, 6) }, kind });
  };
  for (const s of [...walls, ...edges]) {
    if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) < 0.05) { add(s.a, "endpoint"); continue; } // too short for a middle
    add(s.a, "endpoint"); add(s.b, "endpoint"); add({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 }, "midpoint");
  }
  let pairs = 0;
  outer: for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) { if (++pairs > MAX_PAIRS) break outer; const x = segmentIntersection(walls[i].a, walls[i].b, walls[j].a, walls[j].b); if (x) add(x, "intersection"); }
    for (const e of edges) { if (++pairs > MAX_PAIRS) break outer; const x = segmentIntersection(walls[i].a, walls[i].b, e.a, e.b); if (x) add(x, "intersection"); }
  }
  return [...found.values()];
}

// The anchor to snap to: the nearest within the radius, with an endpoint preferred over an intersection and an intersection over a midpoint when they are close
export function findObjectSnap(raw: Pt, anchors: Anchor[], radius: number): Anchor | null {
  if (!ok(raw) || !Array.isArray(anchors) || !(radius > 0)) return null;
  let best: Anchor | null = null, bestScore = Infinity;
  for (const a of anchors) {
    if (!a || !ok(a.p)) continue;
    const d = Math.hypot(raw.x - a.p.x, raw.y - a.p.y);
    if (d > radius) continue;
    const score = d + (a.kind === "endpoint" ? 0 : a.kind === "intersection" ? 0.1 * radius : 0.25 * radius);
    if (score < bestScore) { bestScore = score; best = a; }
  }
  return best;
}

// Where a wall point goes: onto an object snap when one is near; otherwise locked to ortho or polar from the start of the wall; otherwise to the grid. Never off the plan.
// The lines already drawn (walls, and the edges of rooms), for the snaps that depend on a line rather than a point
export function buildSegments(input: { walls?: Seg[]; polygons?: Pt[][] }): Seg[] {
  const out: Seg[] = [];
  for (const s of Array.isArray(input?.walls) ? input.walls : []) if (s && ok(s.a) && ok(s.b) && Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) > 0.05) out.push({ a: s.a, b: s.b });
  for (const poly of Array.isArray(input?.polygons) ? input.polygons : []) {
    const pts = (Array.isArray(poly) ? poly : []).filter(ok);
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; if (Math.hypot(b.x - a.x, b.y - a.y) > 0.05) out.push({ a, b }); }
  }
  return out;
}
// The point on the line AB where a line from `from` would meet it at a right angle, or null when that point is not on the segment
export function perpendicularFoot(from: Pt, a: Pt, b: Pt): Pt | null {
  if (!ok(from) || !ok(a) || !ok(b)) return null;
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (l2 < 1e-9) return null;
  const t = ((from.x - a.x) * dx + (from.y - a.y) * dy) / l2;
  if (t < -1e-9 || t > 1 + 1e-9) return null;
  return { x: rnd(a.x + t * dx, 6), y: rnd(a.y + t * dy, 6) };
}
const PARALLEL_TOLERANCE = Math.sin((3 * Math.PI) / 180); // within 3 degrees of the direction of a line already there

export function resolveWallPoint(o: { raw: Pt; start: Pt | null; mode: DrawMode; anchors: Anchor[]; radius: number; snapOn: boolean; grid: number; shift?: boolean; segments?: Seg[]; ref?: Pt | null }): WallPointResult {
  const grid = o.grid > 0 ? o.grid : 0.05;
  const clamp = (p: Pt): Pt => ({ x: Math.max(0, rnd(p.x, 6)), y: Math.max(0, rnd(p.y, 6)) });
  if (o.snapOn) {
    const a = findObjectSnap(o.raw, o.anchors, o.radius);
    if (a) return { p: clamp(a.p), kind: a.kind, label: SNAP_LABEL[a.kind] };
  }
  const mode: DrawMode = o.shift ? (o.mode === "free" ? "ortho" : "free") : o.mode; // Shift flips between locked and free for as long as it is held
  const ref = o.ref ?? o.start; // what a perpendicular or a parallel is measured from: the start of the line being drawn
  if (o.snapOn && ref && ok(ref) && Array.isArray(o.segments) && o.segments.length > 0) {
    // Perpendicular: the point where a line from the start would meet an existing line at a right angle
    let best: Pt | null = null, bd = o.radius;
    for (const s of o.segments) {
      const f = perpendicularFoot(ref, s.a, s.b);
      if (!f || Math.hypot(f.x - ref.x, f.y - ref.y) < 0.05) continue;
      const d = Math.hypot(o.raw.x - f.x, o.raw.y - f.y);
      if (d <= bd) { bd = d; best = f; }
    }
    if (best) return { p: clamp(best), kind: "perpendicular", label: SNAP_LABEL.perpendicular };
    // Parallel: pointing the same way as an existing line (only when the angle is free; ortho and polar already lock it)
    const vx = o.raw.x - ref.x, vy = o.raw.y - ref.y, dist = Math.hypot(vx, vy);
    if (mode === "free" && dist > 0.2) {
      let bestSin = PARALLEL_TOLERANCE, dir: Pt | null = null;
      for (const s of o.segments) {
        const sx = s.b.x - s.a.x, sy = s.b.y - s.a.y, len = Math.hypot(sx, sy);
        if (len < 0.3) continue;
        const ux = sx / len, uy = sy / len, sin = Math.abs(vx * uy - vy * ux) / dist;
        if (sin < bestSin) { bestSin = sin; dir = vx * ux + vy * uy >= 0 ? { x: ux, y: uy } : { x: -ux, y: -uy }; }
      }
      if (dir) {
        const t = rnd(Math.round((vx * dir.x + vy * dir.y) / grid) * grid, 6);
        const px = ref.x + dir.x * t, py = ref.y + dir.y * t;
        if (t > 0.05 && px >= 0 && py >= 0) return { p: { x: rnd(px, 6), y: rnd(py, 6) }, kind: "parallel", label: SNAP_LABEL.parallel }; // never clamped: a clamped point would no longer be parallel
      }
    }
  }
  if (o.start && ok(o.start)) {
    const p = clamp(constrainPoint(o.start, o.raw, mode, grid));
    const kind: SnapKind = mode === "ortho" ? "ortho" : mode === "polar" ? "polar" : "grid";
    return { p, kind, label: SNAP_LABEL[kind] };
  }
  const g = (v: number) => Math.max(0, rnd(Math.round(v / grid) * grid, 6));
  return { p: { x: g(o.raw.x), y: g(o.raw.y) }, kind: "grid", label: SNAP_LABEL.grid };
}

// A length typed in metres, such as 3.2 or .5 or 3. (digits and one point only). Rounded to the millimetre; nothing, zero or more than 60 m is refused.
export function parseTypedLength(text: unknown): number | null {
  if (typeof text !== "string" || !/^\d*\.?\d*$/.test(text) || text === "" || text === ".") return null;
  const v = Number(text);
  if (!Number.isFinite(v) || v <= 0 || v > MAX_TYPED_LENGTH_M) return null;
  const r = rnd(v, 3);
  return r > 0 ? r : null;
}

// the end of a wall of an exact length, heading the way the pointer is pointing; null when that would run off the top or left of the plan
export function typedWallEnd(start: Pt, towards: Pt, length: number): Pt | null {
  if (!ok(start) || !ok(towards) || !(length > 0)) return null;
  const p = pointAtDistance(start, towards, length);
  const q = { x: rnd(p.x, 3), y: rnd(p.y, 3) };
  return q.x < -EPS || q.y < -EPS ? null : { x: Math.max(0, q.x), y: Math.max(0, q.y) };
}

export function describeWall(start: Pt, end: Pt): { length: number; angleDeg: number } {
  return { length: rnd(Math.hypot(end.x - start.x, end.y - start.y), 3), angleDeg: rnd(lineAngleDeg(start, end), 1) };
}
export const MODE_LABEL: Record<DrawMode, string> = { ortho: "Ortho", polar: "Polar 45°", free: "Free" };
const m2 = (v: number) => v.toFixed(2);

// The line shown under the plan while a wall is being drawn
export function statusLine(o: { cursor: Pt | null; start: Pt | null; snap: WallPointResult | null; mode: DrawMode; snapOn: boolean; zoom: number; typed: string; message?: string }): string {
  const parts: string[] = [];
  if (o.cursor) parts.push(`X ${m2(o.cursor.x)}  Y ${m2(o.cursor.y)} m`);
  if (o.typed) parts.push(`Length ${o.typed} m  ⏎ to place`);
  else if (o.start && o.cursor) { const d = describeWall(o.start, o.cursor); parts.push(`Length ${m2(d.length)} m  Angle ${d.angleDeg.toFixed(1)}°`); }
  if (o.snap && isObjectSnap(o.snap.kind)) parts.push(`Snap: ${o.snap.label}`);
  parts.push(`${MODE_LABEL[o.mode]} (F8)`, `Object snap ${o.snapOn ? "on" : "off"} (F3)`, `${Math.round((Number.isFinite(o.zoom) ? o.zoom : 1) * 100)}%`);
  if (o.message) parts.unshift(o.message);
  return parts.join("  ·  ");
}

// The line shown under the plan while a dimension is being placed: what to do next, the length, the offset, the pointer and the snap
export function dimStatusLine(o: { stage: 0 | 1 | 2; cursor: Pt | null; a: Pt | null; b: Pt | null; off: number | null; snap: WallPointResult | null; snapOn: boolean; zoom: number }): string {
  const parts: string[] = [];
  if (o.stage === 0) parts.push("Click the first point");
  else if (o.stage === 1) {
    parts.push("Click the second point");
    if (o.a && o.cursor) parts.push(`Length ${m2(Math.hypot(o.cursor.x - o.a.x, o.cursor.y - o.a.y))} m`);
  } else {
    parts.push("Move to set how far out the line sits, then click");
    if (o.a && o.b) parts.push(`Length ${m2(Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y))} m`);
    if (o.off !== null && Number.isFinite(o.off)) parts.push(`Offset ${m2(o.off)} m`);
  }
  if (o.cursor) parts.push(`X ${m2(o.cursor.x)}  Y ${m2(o.cursor.y)} m`);
  if (o.stage < 2 && o.snap && isObjectSnap(o.snap.kind)) parts.push(`Snap: ${o.snap.label}`);
  parts.push(`Object snap ${o.snapOn ? "on" : "off"} (F3)`, `${Math.round((Number.isFinite(o.zoom) ? o.zoom : 1) * 100)}%`);
  return parts.join("  ·  ");
}

// Where a point lands when a handle is DRAGGED (the end of a wall, a point of a dimension): onto an object snap when one is near, otherwise on the 5 cm grid. Shift locks it level
// or upright from the other end; Alt puts it exactly where the pointer is. Never off the plan.
export function resolveHandlePoint(o: { raw: Pt; fixed: Pt; anchors: Anchor[]; radius: number; shift?: boolean; alt?: boolean; grid?: number; segments?: Seg[] }): Pt {
  if (o.alt) return { x: Math.max(0, rnd(o.raw.x, 6)), y: Math.max(0, rnd(o.raw.y, 6)) };
  const anchors = Array.isArray(o.anchors) ? o.anchors : [];
  return resolveWallPoint({ raw: o.raw, start: o.shift ? o.fixed : null, ref: o.fixed, mode: "ortho", anchors, segments: o.segments, radius: o.radius, snapOn: anchors.length > 0 || (o.segments?.length ?? 0) > 0, grid: o.grid ?? 0.05 }).p;
}

// The key points of an object that should land on a snap point when it is DRAGGED: a symbol's or label's middle; a wall's two ends and its middle; a dimension's two points
export function movePoints(o: { kind: string; [k: string]: unknown }): Pt[] {
  const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  if (o.kind === "wall" || o.kind === "dim") {
    const x1 = n(o.x1), y1 = n(o.y1), x2 = n(o.x2), y2 = n(o.y2);
    if (x1 === null || y1 === null || x2 === null || y2 === null) return [];
    return o.kind === "wall" ? [{ x: x1, y: y1 }, { x: x2, y: y2 }, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }] : [{ x: x1, y: y1 }, { x: x2, y: y2 }];
  }
  const x = n(o.x), y = n(o.y);
  return x === null || y === null ? [] : [{ x, y }];
}

// How far to move a dragged selection: so that the nearest of its key points lands exactly on a snap point when one is within reach, otherwise so that its first key point is on the
// 5 cm grid; Alt moves it exactly as far as the pointer went. The result is the move to make (the caller still keeps it on the plan).
export function resolveMoveDelta(o: { points: Pt[]; dx: number; dy: number; anchors: Anchor[]; radius: number; alt?: boolean; grid?: number }): { dx: number; dy: number; snapped: Anchor | null } {
  const grid = o.grid && o.grid > 0 ? o.grid : 0.05;
  const pts = (Array.isArray(o.points) ? o.points : []).filter(ok);
  if (o.alt || pts.length === 0 || !Number.isFinite(o.dx) || !Number.isFinite(o.dy)) return { dx: o.dx, dy: o.dy, snapped: null };
  let best: { a: Anchor; d: number; ex: number; ey: number } | null = null;
  for (const p of pts) {
    const tx = p.x + o.dx, ty = p.y + o.dy;
    const a = findObjectSnap({ x: tx, y: ty }, Array.isArray(o.anchors) ? o.anchors : [], o.radius);
    if (!a) continue;
    const d = Math.hypot(a.p.x - tx, a.p.y - ty);
    if (!best || d < best.d) best = { a, d, ex: a.p.x - tx, ey: a.p.y - ty };
  }
  if (best) return { dx: rnd(o.dx + best.ex, 6), dy: rnd(o.dy + best.ey, 6), snapped: best.a };
  const p0 = pts[0];
  return { dx: rnd(Math.round((p0.x + o.dx) / grid) * grid - p0.x, 6), dy: rnd(Math.round((p0.y + o.dy) / grid) * grid - p0.y, 6), snapped: null };
}
