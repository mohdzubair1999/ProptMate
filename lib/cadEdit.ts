import { segmentIntersection, type Seg } from "./cadSnap";

// Trimming and extending walls, and joining two walls at a corner. Pure (no screen, no database), so every rule is tested directly. Lengths are in metres.
type Pt = { x: number; y: number };
export type WallEnds = { x1: number; y1: number; x2: number; y2: number };
const rnd = (v: number) => Math.round(v * 1000) / 1000;
const MIN_LEN = 0.1; // a wall needs some length
const MAX_REACH = 30; // an end is never extended further than this
const finite = (w: WallEnds | null | undefined): w is WallEnds => !!w && [w.x1, w.y1, w.x2, w.y2].every(Number.isFinite);

// One end of a wall, made to MEET the lines around it: if the wall crosses a line before reaching that end, it is trimmed back to the nearest crossing to that end;
// if not, it is extended in the same direction to the first line it would meet. Returns null when there is nothing to meet (or the result would be too short).
export function trimOrExtend(wall: WallEnds, end: 1 | 2, boundaries: Seg[]): { wall: WallEnds; action: "trim" | "extend" } | null {
  if (!finite(wall) || !Array.isArray(boundaries)) return null;
  const e: Pt = end === 1 ? { x: wall.x1, y: wall.y1 } : { x: wall.x2, y: wall.y2 }, o: Pt = end === 1 ? { x: wall.x2, y: wall.y2 } : { x: wall.x1, y: wall.y1 };
  const len = Math.hypot(e.x - o.x, e.y - o.y);
  if (len < 1e-6) return null;
  const ux = (e.x - o.x) / len, uy = (e.y - o.y) / len;
  const set = (p: Pt): WallEnds => (end === 1 ? { x1: rnd(p.x), y1: rnd(p.y), x2: wall.x2, y2: wall.y2 } : { x1: wall.x1, y1: wall.y1, x2: rnd(p.x), y2: rnd(p.y) });
  // trim: the crossings on the wall itself, away from its other end and short of this one; the one nearest this end
  let trimAt: Pt | null = null, trimS = -1;
  for (const b of boundaries) {
    const x = segmentIntersection(o, e, b.a, b.b);
    if (!x) continue;
    const s = Math.hypot(x.x - o.x, x.y - o.y);
    if (s > MIN_LEN && s < len - 0.02 && s > trimS) { trimS = s; trimAt = x; }
  }
  if (trimAt) return { wall: set(trimAt), action: "trim" };
  // extend: the first line met beyond this end
  const far: Pt = { x: e.x + ux * MAX_REACH, y: e.y + uy * MAX_REACH };
  let hit: Pt | null = null, hitT = Infinity;
  for (const b of boundaries) {
    const x = segmentIntersection(e, far, b.a, b.b);
    if (!x) continue;
    const t = Math.hypot(x.x - e.x, x.y - e.y);
    if (t > 0.02 && t < hitT) { hitT = t; hit = x; }
  }
  if (hit && hit.x >= 0 && hit.y >= 0) return { wall: set(hit), action: "extend" };
  return null;
}

// Two walls joined at their corner: each is extended or trimmed, at the end nearer the corner, to the point where their lines cross. Null when they are parallel, the corner
// is off the plan or too far away, or a wall would be left too short.
export function cornerWalls(a: WallEnds, b: WallEnds): { a: WallEnds; b: WallEnds } | null {
  if (!finite(a) || !finite(b)) return null;
  const rx = a.x2 - a.x1, ry = a.y2 - a.y1, sx = b.x2 - b.x1, sy = b.y2 - b.y1;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-6) return null; // parallel
  const t = ((b.x1 - a.x1) * sy - (b.y1 - a.y1) * sx) / den;
  const p: Pt = { x: rnd(a.x1 + t * rx), y: rnd(a.y1 + t * ry) };
  if (p.x < 0 || p.y < 0 || [a, b].some((w) => Math.min(Math.hypot(p.x - w.x1, p.y - w.y1), Math.hypot(p.x - w.x2, p.y - w.y2)) > MAX_REACH)) return null;
  const join = (w: WallEnds): WallEnds | null => {
    const d1 = Math.hypot(p.x - w.x1, p.y - w.y1), d2 = Math.hypot(p.x - w.x2, p.y - w.y2);
    const out: WallEnds = d1 <= d2 ? { x1: p.x, y1: p.y, x2: w.x2, y2: w.y2 } : { x1: w.x1, y1: w.y1, x2: p.x, y2: p.y };
    return Math.hypot(out.x2 - out.x1, out.y2 - out.y1) < MIN_LEN ? null : out;
  };
  const ja = join(a), jb = join(b);
  return ja && jb ? { a: ja, b: jb } : null;
}
