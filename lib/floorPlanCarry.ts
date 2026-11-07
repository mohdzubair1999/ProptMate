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
  return o.kind === "wall" ? [(o.x1 + o.x2) / 2, (o.y1 + o.y2) / 2] : [o.x, o.y];
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
    return inPolygon(local, room.points);
  });
}
