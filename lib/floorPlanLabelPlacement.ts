// Keeps a room's name readable: when furniture, a free-standing wall or a text label would cover it, the name moves to
// the nearest free spot inside the room. Pure arithmetic, so it is tested directly (including turned rooms).
//
// Everything is worked out in the room's OWN frame (the one it is drawn in: origin at its corner, turned about its
// centre), because that is where the name is positioned.

import { type PlanObject, objectCorners } from "./floorPlanObjects";

export type LabelPlacementInput = {
  // The room as drawn: where its corner sits on the plan (metres), its size, and how far it is turned (degrees).
  room: { x: number; y: number; widthM: number; lengthM: number; rotationDeg: number };
  objects: PlanObject[];
  // The label's box, in the room's own pixels, at its default place (the middle of the room).
  label: { cx: number; cy: number; w: number; h: number };
  pxPerMetre?: number;
  originPx?: number;
};

type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Pt = [number, number];
const STEP = 6; // px between positions tried
const PAD = 3; // px of breathing room round the name
const EDGE = 4; // px kept clear of the room's own walls
const MAX_OBSTACLES = 60; // beyond this many items in one room the name is simply left where it is
const TIGHT_SEARCH_MAX = 24; // the finer second pass is only worth its cost in a room that is not crowded

function toLocal(p: Pt, room: LabelPlacementInput["room"], ppm: number, origin: number): Pt {
  const w = room.widthM * ppm, l = room.lengthM * ppm;
  // world pixel -> the room's frame: undo the translation, then undo the turn about the room's centre
  const qx = p[0] * ppm + origin - (room.x * ppm + origin) - w / 2;
  const qy = p[1] * ppm + origin - (room.y * ppm + origin) - l / 2;
  const t = (-room.rotationDeg * Math.PI) / 180;
  return [w / 2 + qx * Math.cos(t) - qy * Math.sin(t), l / 2 + qx * Math.sin(t) + qy * Math.cos(t)];
}

const bboxOf = (pts: Pt[]): Box => ({ minX: Math.min(...pts.map((p) => p[0])), minY: Math.min(...pts.map((p) => p[1])), maxX: Math.max(...pts.map((p) => p[0])), maxY: Math.max(...pts.map((p) => p[1])) });
const overlapArea = (a: Box, b: Box) => Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) * Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));

// Does the name's box touch the object's real outline? (Both are convex, so a separating-axis test is exact.) An object's
// bounding box would be simpler, but for a turned sofa it is much bigger than the sofa and hides free corners.
function hits(box: Box, poly: Pt[]): boolean {
  const rect: Pt[] = [[box.minX, box.minY], [box.maxX, box.minY], [box.maxX, box.maxY], [box.minX, box.maxY]];
  const axes: Pt[] = [[1, 0], [0, 1]];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const nx = -(b[1] - a[1]), ny = b[0] - a[0], len = Math.hypot(nx, ny);
    if (len > 1e-9) axes.push([nx / len, ny / len]);
  }
  for (const [ax, ay] of axes) {
    const pr = rect.map((p) => p[0] * ax + p[1] * ay), po = poly.map((p) => p[0] * ax + p[1] * ay);
    if (Math.max(...pr) < Math.min(...po) || Math.max(...po) < Math.min(...pr)) return false; // a gap: they do not touch
  }
  return true;
}

// How far to move the room's name, in the room's own pixels. (0, 0) when nothing is in its way.
export function labelOffset(input: LabelPlacementInput): { dx: number; dy: number } {
  const ppm = input.pxPerMetre ?? 40, origin = input.originPx ?? 10;
  const { room, label } = input;
  const roomW = room.widthM * ppm, roomH = room.lengthM * ppm;

  // Every object that touches this room: its true outline in the room's frame, and its bounding box.
  const obstacles: { poly: Pt[]; box: Box }[] = [];
  for (const o of input.objects) {
    const poly = objectCorners(o, ppm).map((c) => toLocal(c, room, ppm, origin));
    const box = bboxOf(poly);
    if (box.maxX > 0 && box.minX < roomW && box.maxY > 0 && box.minY < roomH) obstacles.push({ poly, box });
  }
  if (obstacles.length === 0) return { dx: 0, dy: 0 };
  // A room packed with dozens of items has no sensible free spot, and searching would only slow the editor: leave the name.
  if (obstacles.length > MAX_OBSTACLES) return { dx: 0, dy: 0 };

  // The name must stay inside the room: how far it may move each way.
  const loX = EDGE + label.w / 2 - label.cx, hiX = roomW - EDGE - label.w / 2 - label.cx;
  const loY = EDGE + label.h / 2 - label.cy, hiY = roomH - EDGE - label.h / 2 - label.cy;

  // Looks for the best spot using a given breathing room and step. Covering fewer objects always wins; ties are broken
  // by how much is covered; zero cost means a clear spot.
  const search = (pad: number, step: number) => {
    const at = (dx: number, dy: number): Box => ({ minX: label.cx + dx - label.w / 2 - pad, maxX: label.cx + dx + label.w / 2 + pad, minY: label.cy + dy - label.h / 2 - pad, maxY: label.cy + dy + label.h / 2 + pad });
    const cost = (dx: number, dy: number) => {
      const b = at(dx, dy);
      let c = 0;
      for (const o of obstacles) if (overlapArea(b, o.box) > 0 && hits(b, o.poly)) c += 1 + overlapArea(b, o.box) / 1e7;
      return c;
    };
    const xs: number[] = [], ys: number[] = [];
    for (let v = 0; v >= loX; v -= step) xs.push(v);
    for (let v = step; v <= hiX; v += step) xs.push(v);
    for (let v = 0; v >= loY; v -= step) ys.push(v);
    for (let v = step; v <= hiY; v += step) ys.push(v);
    let best = { dx: 0, dy: 0, c: cost(0, 0), d: 0 };
    for (const dx of xs) {
      for (const dy of ys) {
        const c = cost(dx, dy), d = Math.hypot(dx, dy);
        if (c < best.c - 1e-9 || (Math.abs(c - best.c) < 1e-9 && d < best.d)) best = { dx, dy, c, d };
      }
    }
    return best;
  };

  const first = search(PAD, STEP);
  if (first.c === 0) return { dx: first.dx, dy: first.dy }; // clear (also covers "nothing was in the way": cost 0 at the start)
  // No spot has breathing room. Try a finer search with none, in case a tight gap exists, before settling for least covered.
  const tight = obstacles.length <= TIGHT_SEARCH_MAX ? search(0, 3) : first;
  const best = tight.c < first.c - 1e-9 ? tight : first;
  return { dx: best.dx, dy: best.dy };
}
