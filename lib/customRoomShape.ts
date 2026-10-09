// Geometry for hand-drawn ("draw it yourself, CAD style") room outlines.
//
// Deliberately pure functions with no React or database access, so the exact code that runs in
// the editor and on the server can be tested directly with made-up shapes.
//
// How a drawn room is stored: the corners are saved as fractions (0-1) of the room's own width
// and length - a "unit outline". The real corner positions are always unitPoint * width and
// unitPoint * length. This is what lets a hand-drawn room behave like every other room in the
// editor (resizing, dimension lines, area, collision detection, auto-layout, rotation) with no
// special cases: its bounding box is, by construction, exactly widthM x lengthM.
//
// Winding: outlines are always stored clockwise as seen on screen (y grows downward), which is
// the same winding the built-in shapes use - the inward-wall maths for zigzag/alcove walls
// depends on it.

export type Pt = { x: number; y: number };
export type DrawMode = "ortho" | "polar" | "free";

export const MIN_AREA_M2 = 0.25;
export const MIN_DIMENSION_M = 0.3;
export const MAX_DIMENSION_M = 30; // matches the limit the server already enforces on every room
export const MAX_POINTS = 200;

const EPS = 1e-9;

const round = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

// Positive for clockwise-on-screen (y down) outlines.
export function polygonSignedArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export const polygonArea = (pts: Pt[]) => Math.abs(polygonSignedArea(pts));

function cross(o: Pt, a: Pt, b: Pt) {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function withinSegmentBox(a: Pt, b: Pt, p: Pt) {
  return (
    p.x >= Math.min(a.x, b.x) - EPS &&
    p.x <= Math.max(a.x, b.x) + EPS &&
    p.y >= Math.min(a.y, b.y) - EPS &&
    p.y <= Math.max(a.y, b.y) + EPS
  );
}

// True if the two segments share any point at all - crossing, touching, or overlapping.
export function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = cross(p3, p4, p1);
  const d2 = cross(p3, p4, p2);
  const d3 = cross(p1, p2, p3);
  const d4 = cross(p1, p2, p4);
  if (((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))) return true;
  if (Math.abs(d1) <= EPS && withinSegmentBox(p3, p4, p1)) return true;
  if (Math.abs(d2) <= EPS && withinSegmentBox(p3, p4, p2)) return true;
  if (Math.abs(d3) <= EPS && withinSegmentBox(p1, p2, p3)) return true;
  if (Math.abs(d4) <= EPS && withinSegmentBox(p1, p2, p4)) return true;
  return false;
}

// Whether an outline crosses, touches, or folds back over itself. closed=false treats the points
// as an unfinished polyline (the wall still being drawn); closed=true includes the closing wall.
export function polygonSelfIntersects(pts: Pt[], closed: boolean): boolean {
  const n = pts.length;
  const segs = closed ? n : n - 1;
  if (segs < 2) return false;
  for (let i = 0; i < segs; i++) {
    const a1 = pts[i];
    const a2 = pts[(i + 1) % n];
    for (let j = i + 1; j < segs; j++) {
      const b1 = pts[j];
      const b2 = pts[(j + 1) % n];
      const consecutive = j === i + 1;
      const wraps = closed && i === 0 && j === segs - 1;
      if (consecutive || wraps) {
        // Neighbouring walls always share a corner. The only way they can also overlap is by
        // doubling straight back over each other, so that is the only thing to test for.
        const shared = consecutive ? a2 : a1;
        const other1 = consecutive ? a1 : a2;
        const other2 = consecutive ? b2 : b1;
        const collinear = Math.abs(cross(shared, other1, other2)) <= EPS;
        const sameDirection = (other1.x - shared.x) * (other2.x - shared.x) + (other1.y - shared.y) * (other2.y - shared.y) > 0;
        if (collinear && sameDirection) return true;
        continue;
      }
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

// Drops repeated points and corners that sit exactly on a straight run - a straight wall needs
// no corner in the middle of it.
function cleanPoints(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-6) out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) <= 1e-6) out.pop();

  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const straight = Math.abs(cross(a, b, c)) <= 1e-7 && (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y) > 0;
      if (straight) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

export type NormalizedOutline = {
  xM: number; // where the room's top-left sits in the plan
  yM: number;
  widthM: number;
  lengthM: number;
  unitPoints: number[][]; // corners as 0-1 fractions of width / length
};

// Turns corners drawn anywhere on the plan into a room: its position, its bounding-box size,
// and the unit outline. Returns null for anything that isn't a sound room (too few corners,
// crosses itself, too small, or bigger than the 30 m limit).
export function normalizeDrawnPolygon(world: Pt[]): NormalizedOutline | null {
  if (world.length < 3 || world.length > MAX_POINTS) return null;
  let pts = cleanPoints(world.map((p) => ({ x: round(p.x, 4), y: round(p.y, 4) })));
  if (pts.length < 3) return null;
  if (polygonSelfIntersects(pts, true)) return null;
  if (polygonSignedArea(pts) < 0) pts = pts.slice().reverse();
  if (polygonArea(pts) < MIN_AREA_M2) return null;

  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const w = Math.max(...pts.map((p) => p.x)) - minX;
  const l = Math.max(...pts.map((p) => p.y)) - minY;
  if (w < MIN_DIMENSION_M || l < MIN_DIMENSION_M || w > MAX_DIMENSION_M || l > MAX_DIMENSION_M) return null;

  // Wall numbering starts at the top-most (then left-most) corner and runs clockwise - the same
  // "top-left, clockwise" convention the built-in shapes use.
  let start = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].y < pts[start].y - 1e-9 || (Math.abs(pts[i].y - pts[start].y) <= 1e-9 && pts[i].x < pts[start].x)) start = i;
  }
  pts = [...pts.slice(start), ...pts.slice(0, start)];

  return {
    xM: round(minX, 4),
    yM: round(minY, 4),
    widthM: round(w, 4),
    lengthM: round(l, 4),
    unitPoints: pts.map((p) => [round((p.x - minX) / w, 6), round((p.y - minY) / l, 6)]),
  };
}

export function unitToLocal(unit: number[][], widthM: number, lengthM: number): Pt[] {
  return unit.map(([u, v]) => ({ x: u * widthM, y: v * lengthM }));
}

// Validates a unit outline read back from storage or the network - never trusted as-is.
export function validateUnitPoints(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length < 3 || raw.length > MAX_POINTS) return null;
  const pts: number[][] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length !== 2) return null;
    const [u, v] = item;
    if (typeof u !== "number" || typeof v !== "number" || !Number.isFinite(u) || !Number.isFinite(v)) return null;
    if (u < -1e-6 || u > 1 + 1e-6 || v < -1e-6 || v > 1 + 1e-6) return null;
    pts.push([round(Math.min(1, Math.max(0, u)), 6), round(Math.min(1, Math.max(0, v)), 6)]);
  }
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  // The outline must actually span its whole bounding box, or the room's width/length wouldn't match its shape.
  if (Math.min(...us) > 1e-3 || Math.max(...us) < 1 - 1e-3 || Math.min(...vs) > 1e-3 || Math.max(...vs) < 1 - 1e-3) return null;
  const asPts = pts.map(([x, y]) => ({ x, y }));
  if (polygonSelfIntersects(asPts, true)) return null;
  const signed = polygonSignedArea(asPts);
  if (Math.abs(signed) < 1e-4) return null;
  return signed < 0 ? pts.slice().reverse() : pts;
}

function rotateAbout(p: Pt, c: Pt, angleDeg: number): Pt {
  if (!angleDeg) return { x: p.x, y: p.y };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

// After a corner is moved, added or removed the outline's bounding box changes. This recomputes
// the room's width, length, position and unit outline so that every corner stays exactly where
// it was on the plan - including when the room is rotated (rotation is about the room's own
// centre, and the centre moves when the box changes). Returns null if the edit isn't valid.
export function rebuildCustomOutline(local: Pt[], oldW: number, oldL: number, oldOrigin: Pt, rotationDeg: number): NormalizedOutline | null {
  if (local.length < 3 || local.length > MAX_POINTS) return null;
  if (polygonSelfIntersects(local, true)) return null;
  if (polygonSignedArea(local) <= 0) return null;
  if (polygonArea(local) < MIN_AREA_M2) return null;

  const minX = Math.min(...local.map((p) => p.x));
  const minY = Math.min(...local.map((p) => p.y));
  const nw = Math.max(...local.map((p) => p.x)) - minX;
  const nl = Math.max(...local.map((p) => p.y)) - minY;
  if (nw < MIN_DIMENSION_M || nl < MIN_DIMENSION_M || nw > MAX_DIMENSION_M || nl > MAX_DIMENSION_M) return null;

  const oldCentre = { x: oldW / 2, y: oldL / 2 };
  const newCentre = { x: nw / 2, y: nl / 2 };
  // world(p) = origin + centre + R(p - centre). Solving for the new origin so world(p) is
  // unchanged for every corner gives: origin' = origin + (c - c') + R(m + c' - c).
  const shift = rotateAbout({ x: minX + newCentre.x - oldCentre.x, y: minY + newCentre.y - oldCentre.y }, { x: 0, y: 0 }, rotationDeg);
  const origin = { x: oldOrigin.x + (oldCentre.x - newCentre.x) + shift.x, y: oldOrigin.y + (oldCentre.y - newCentre.y) + shift.y };

  for (const p of local) {
    const q = rotateAbout({ x: p.x - minX, y: p.y - minY }, newCentre, rotationDeg);
    if (origin.x + q.x < -1e-6 || origin.y + q.y < -1e-6) return null; // never let a room slide off the top/left of the plan
  }

  return {
    xM: round(origin.x, 4),
    yM: round(origin.y, 4),
    widthM: round(nw, 4),
    lengthM: round(nl, 4),
    unitPoints: local.map((p) => [round((p.x - minX) / nw, 6), round((p.y - minY) / nl, 6)]),
  };
}

// Drawing-time snapping, measured from the last placed corner (like AutoCAD's ortho / polar
// tracking). Lengths snap to the grid so walls come out as clean, round measurements.
export function constrainPoint(last: Pt, raw: Pt, mode: DrawMode, grid: number): Pt {
  const g = (v: number) => round(Math.round(v / grid) * grid, 6);
  if (mode === "free") return { x: g(raw.x), y: g(raw.y) };

  const dx = raw.x - last.x;
  const dy = raw.y - last.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { x: last.x, y: last.y };
  const snapLen = (v: number) => Math.round(v / grid) * grid;

  if (mode === "ortho") {
    return Math.abs(dx) >= Math.abs(dy)
      ? { x: round(last.x + Math.sign(dx) * snapLen(Math.abs(dx)), 6), y: last.y }
      : { x: last.x, y: round(last.y + Math.sign(dy) * snapLen(Math.abs(dy)), 6) };
  }

  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const dist = snapLen(len);
  return { x: round(last.x + dist * Math.cos(angle), 6), y: round(last.y + dist * Math.sin(angle), 6) };
}

// A point `dist` metres from `from`, heading towards `towards` (used for typed-in wall lengths).
export function pointAtDistance(from: Pt, towards: Pt, dist: number): Pt {
  let dx = towards.x - from.x;
  let dy = towards.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-9) {
    dx = 1;
    dy = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  return { x: round(from.x + dx * dist, 6), y: round(from.y + dy * dist, 6) };
}

// Angle as it looks on screen: 0 = east, 90 = north (counter-clockwise), like a CAD readout.
export function lineAngleDeg(from: Pt, to: Pt): number {
  return (((Math.atan2(-(to.y - from.y), to.x - from.x) * 180) / Math.PI) + 360) % 360;
}

function pointInPolygon(x: number, y: number, pts: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToEdges(x: number, y: number, pts: number[][]): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

// Where to put a room's label. The plain centroid is fine for most rooms, but for an L or U shaped
// outline it can land outside the room entirely. This keeps the centroid whenever it is comfortably
// inside, and otherwise picks the interior point furthest from any wall.
export function visualCenter(pts: number[][]): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const c = x0 * y1 - x1 * y0;
    area += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  area *= 0.5;
  const centroid: [number, number] = Math.abs(area) < 1e-9 ? [pts[0][0], pts[0][1]] : [cx / (6 * area), cy / (6 * area)];

  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const stepsN = 28;
  let best: [number, number] = centroid;
  let bestDist = -1;
  for (let i = 0; i <= stepsN; i++) {
    for (let j = 0; j <= stepsN; j++) {
      const x = minX + ((Math.max(...xs) - minX) * i) / stepsN;
      const y = minY + ((Math.max(...ys) - minY) * j) / stepsN;
      if (!pointInPolygon(x, y, pts)) continue;
      const d = distanceToEdges(x, y, pts);
      if (d > bestDist) {
        bestDist = d;
        best = [x, y];
      }
    }
  }
  if (pointInPolygon(centroid[0], centroid[1], pts) && distanceToEdges(centroid[0], centroid[1], pts) >= bestDist * 0.6) return centroid;
  return best;
}

// ---------------------------------------------------------------------------------------------
// Doors and windows attached to a real wall of a hand-drawn room (rather than to a side of its
// bounding box, which may not be a wall at all on an irregular outline).
// ---------------------------------------------------------------------------------------------

export type EdgeFrame = {
  a: Pt; // where the wall starts
  b: Pt; // where it ends
  dir: Pt; // unit vector along the wall, a -> b
  normal: Pt; // unit vector pointing INTO the room (outlines are stored clockwise on screen)
  length: number;
  angleDeg: number; // direction of the wall on screen, for rotating a drawing onto it
};

// Wall i runs from corner i to corner i+1 - the same numbering the custom-wall controls use.
export function edgeFrame(points: Pt[], edgeIndex: number): EdgeFrame | null {
  const n = points.length;
  if (!Number.isInteger(edgeIndex) || edgeIndex < 0 || edgeIndex >= n) return null;
  const a = points[edgeIndex];
  const b = points[(edgeIndex + 1) % n];
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 1e-9) return null;
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  return { a, b, dir, normal: { x: -dir.y, y: dir.x }, length, angleDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI };
}

type Opening = { edgeIndex?: number; positionM: number };

// A corner is added in the middle of wall `afterIndex`: openings on that wall stay exactly where
// they were, on whichever half now contains them; every later wall shifts up by one.
export function remapOpeningsAfterInsert<T extends Opening>(items: T[], pointsBefore: Pt[], afterIndex: number): T[] {
  const n = pointsBefore.length;
  const a = pointsBefore[afterIndex];
  const b = pointsBefore[(afterIndex + 1) % n];
  const firstHalf = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  return items.map((item) => {
    if (item.edgeIndex === undefined) return item;
    if (item.edgeIndex < afterIndex) return item;
    if (item.edgeIndex > afterIndex) return { ...item, edgeIndex: item.edgeIndex + 1 };
    return item.positionM <= firstHalf ? item : { ...item, edgeIndex: afterIndex + 1, positionM: item.positionM - firstHalf };
  });
}

// A corner is removed: the two walls that met there merge into one. An opening keeps its exact
// distance along the merged wall (measured from the merged wall's start), clamped to its new length.
export function remapOpeningsAfterDelete<T extends Opening>(items: T[], pointsBefore: Pt[], vertexIndex: number): T[] {
  const n = pointsBefore.length;
  const prev = (vertexIndex - 1 + n) % n;
  const mergedIndex = vertexIndex === 0 ? n - 2 : vertexIndex - 1;
  const lenPrev = Math.hypot(pointsBefore[vertexIndex].x - pointsBefore[prev].x, pointsBefore[vertexIndex].y - pointsBefore[prev].y);
  const after = pointsBefore[(vertexIndex + 1) % n];
  const mergedLen = Math.hypot(after.x - pointsBefore[prev].x, after.y - pointsBefore[prev].y);
  return items.map((item) => {
    const e = item.edgeIndex;
    if (e === undefined) return item;
    if (e === prev) return { ...item, edgeIndex: mergedIndex, positionM: Math.min(item.positionM, mergedLen) };
    if (e === vertexIndex) return { ...item, edgeIndex: mergedIndex, positionM: Math.min(lenPrev + item.positionM, mergedLen) };
    if (vertexIndex === 0) return { ...item, edgeIndex: e - 1 }; // every other wall (1..n-2) shifts down
    return e > vertexIndex ? { ...item, edgeIndex: e - 1 } : item;
  });
}

// Where two outlines genuinely share a wall: the longest stretch where a wall of one runs parallel
// to, and touches, a wall of the other. Works for any outline, at any rotation - the plain
// box-against-box test only understood upright rectangles.
export function findSharedWallSegment(aPts: Pt[], bPts: Pt[], tolerance = 0.15, minLength = 0.6): { start: Pt; end: Pt } | null {
  let best: { start: Pt; end: Pt; len: number } | null = null;
  for (let i = 0; i < aPts.length; i++) {
    const a1 = aPts[i];
    const a2 = aPts[(i + 1) % aPts.length];
    const la = Math.hypot(a2.x - a1.x, a2.y - a1.y);
    if (la < minLength) continue;
    const ux = (a2.x - a1.x) / la;
    const uy = (a2.y - a1.y) / la;
    for (let j = 0; j < bPts.length; j++) {
      const b1 = bPts[j];
      const b2 = bPts[(j + 1) % bPts.length];
      const lb = Math.hypot(b2.x - b1.x, b2.y - b1.y);
      if (lb < minLength) continue;
      const vx = (b2.x - b1.x) / lb;
      const vy = (b2.y - b1.y) / lb;
      if (Math.abs(ux * vy - uy * vx) > 0.035) continue; // not parallel (within ~2 degrees)
      const off1 = (b1.x - a1.x) * -uy + (b1.y - a1.y) * ux; // perpendicular distance of B's wall from A's line
      const off2 = (b2.x - a1.x) * -uy + (b2.y - a1.y) * ux;
      if (Math.abs(off1) > tolerance || Math.abs(off2) > tolerance) continue;
      const t1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
      const t2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
      const start = Math.max(0, Math.min(t1, t2));
      const end = Math.min(la, Math.max(t1, t2));
      if (end - start >= minLength && (!best || end - start > best.len)) {
        best = { start: { x: a1.x + ux * start, y: a1.y + uy * start }, end: { x: a1.x + ux * end, y: a1.y + uy * end }, len: end - start };
      }
    }
  }
  return best ? { start: best.start, end: best.end } : null;
}
