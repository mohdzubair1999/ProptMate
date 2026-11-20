// Which furniture, walls and labels travel with a room when the room is dragged: the ones that are INSIDE it. An item is
// inside when its centre (a wall: its midpoint) is within the room's outline - checked against the room's real shape and
// how far it is turned, so an L-shaped or turned room carries exactly what sits in it.

import type { PlanObject } from "./floorPlanObjects";

export type CarryRoom = {
  x: number; // where the room's corner sits on the plan, in metres
  y: number;
  widthM: number;
  lengthM: number;
  rotationDeg: number; // turned about the room's centre
  points: [number, number][]; // the room's outline, in metres, in the room's own frame
};

function centreOf(o: PlanObject): [number, number] {
  return o.kind === "wall" || o.kind === "dim" ? [(o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2] : [o.x, o.y];
}

// how far a point is from the nearest edge of a polygon
function distToEdges(p: [number, number], poly: [number, number][]): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / l2));
    best = Math.min(best, Math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy)));
  }
  return best;
}

function inPolygon(p: [number, number], poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function objectsInRoom(objects: PlanObject[], room: CarryRoom): PlanObject[] {
  if (objects.length === 0 || room.points.length < 3) return [];
  const t = (-room.rotationDeg * Math.PI) / 180, cos = Math.cos(t), sin = Math.sin(t);
  const cx = room.widthM / 2, cy = room.lengthM / 2;
  return objects.filter((o) => {
    const [wx, wy] = centreOf(o);
    // the plan's frame -> the room's own frame: undo the position, then undo the turn about the room's centre
    const qx = wx - room.x - cx, qy = wy - room.y - cy;
    const local: [number, number] = [cx + qx * cos - qy * sin, cy + qx * sin + qy * cos];
    if (inPolygon(local, room.points)) return true;
    // a dimension measures along a room's wall, so the middle of what it measures is ON the outline: it travels with the room when it is within 20 cm of it
    return o.kind === "dim" && distToEdges(local, room.points) <= 0.2;
  });
}
