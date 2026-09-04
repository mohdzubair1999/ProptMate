"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveFloorPlan, deleteFloorPlan } from "@/lib/actions/floorplan";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

type Room = {
  name: string;
  widthM: string;
  lengthM: string;
  xM?: number;
  yM?: number;
  shape: "rectangle" | "bay-window" | "l-shape" | "angled-corner" | "trapezoid" | "sloped-top";
  bayWidthM?: string;
  bayDepthM?: string;
  notchWidthM?: string;
  notchDepthM?: string;
  // Which corner the notch is cut from — undefined means "bottom-right", matching the
  // original, only-ever-supported behaviour, so already-saved L-shaped rooms keep their
  // exact existing appearance without needing any migration.
  notchCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  // A room with one corner cut off diagonally instead of at a right angle — for a wall that
  // follows an angled property boundary or similar, without rotating the whole room. The
  // bounding box stays a normal axis-aligned widthM x lengthM rectangle throughout, so every
  // other system (collision detection, auto-layout, drag positioning, the resize handles)
  // keeps working completely unchanged; only the corner itself is visually cut at a diagonal.
  angledCutWidthM?: string;
  angledCutDepthM?: string;
  angledCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  // A room where one or both side walls run diagonally instead of straight down, narrowing
  // (or widening) from top to bottom — widthM stays the room's maximum (bottom) width, and
  // trapezoidTopWidthM is the narrower top edge. Bounding box is still just widthM x lengthM,
  // so this carries the exact same low-risk properties as angled-corner above.
  trapezoidTopWidthM?: string;
  trapezoidSide?: "left" | "right" | "both";
  // A room where the left and right walls stay straight/vertical, but the top wall itself
  // runs diagonally — one top corner sits lower than the other by slopedTopAmountM. lengthM
  // stays the room's maximum (taller-side) length throughout, same low-risk bounding-box
  // properties as every other non-rectangular shape here.
  slopedTopAmountM?: string;
  slopedTopSide?: "left" | "right";
  // Lets a bay window be combined with any OTHER primary shape above (notch, angled corner,
  // trapezoid, sloped top) rather than being mutually exclusive with them - shape:"bay-window"
  // remains the original, standalone "just a bay window, nothing else" case, kept exactly as
  // it was for already-saved rooms; this is the separate, additive path for combining one with
  // something else. Reuses the same bayWidthM/bayDepthM fields either way, since the actual bay
  // geometry doesn't differ based on which mechanism produced it - only whether anything else
  // is combined with it. Only takes effect when the primary shape doesn't already modify the
  // bottom edge itself (a bottom-left/bottom-right notch or angled corner) - combining two
  // modifiers of the same edge would be genuinely ambiguous, so that combination silently
  // falls back to the primary shape alone rather than risk broken, self-intersecting geometry.
  hasBayWindow?: boolean;
  // True arbitrary-angle rotation (0-359.9), applied around the room's own centre. Unlike
  // every other shape modifier above, this genuinely changes the room's real, axis-aligned
  // footprint in world space (a rotated rectangle's true bounding box is bigger than its own
  // un-rotated width x length, except at exact 90-degree multiples) - so unlike those, this
  // can't be treated as a purely cosmetic overlay. Collision detection, the shelf-packing
  // auto-layout, and the resize handles are all made aware of it (see rotateWorldPolygon and
  // rotatedBoundingBox below); wall-sharing/door-snapping intentionally still uses the room's
  // un-rotated bounding box as a reasonable approximation, consistent with how every other
  // irregular shape already handles that same lower-stakes calculation.
  rotationDeg?: string;
  connectedTo?: string[];
  flippedSwingConnections?: string[];
  flippedHingeConnections?: string[];
  isStairs?: boolean;
  stairDirection?: "up" | "down";
  stairLinkFloor?: string;
  stairLinkRoom?: string;
  fixturePositions?: { type: string; xM: number; yM: number; rotated?: boolean; mirrored?: boolean }[];
  enabledFixtures?: string[];
  // undefined means "use whatever's auto-detected from the room's name" - a defined array
  // (even an empty one, meaning "no fixtures at all") is an explicit override that always
  // wins, letting a room like "Snug" get living-room fixtures despite no name match, or a
  // "Bedroom with Ensuite" show both bedroom and bathroom fixtures at once.
  manualRoomTypes?: ("bathroom" | "kitchen" | "bedroom" | "livingroom")[];
  isGarden?: boolean;
  exteriorDoors?: { type?: "main" | "rear"; label?: string; wall: "top" | "bottom" | "left" | "right"; positionM: number; swingFlipped?: boolean }[];
  windows?: { wall: "top" | "bottom" | "left" | "right"; positionM: number }[];
};
type Level = { name: string; rooms: Room[] };

const PIXELS_PER_METRE = 40;

// The proper area-weighted polygon centroid, not a naive bounding-box center or vertex
// average — for a non-convex shape like an L-shape with a large notch, the bounding-box
// center can land inside the cut-out area itself (confirmed with realistic dimensions before
// fixing this), which would place a room's label outside its own visible shape entirely. For
// a plain rectangle this produces the exact same point as the bounding-box center, so
// existing rectangular and bay-window rooms are unaffected.
function polygonCentroid(points: number[][]): [number, number] {
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  area *= 0.5;
  if (Math.abs(area) < 1e-9) {
    // Degenerate polygon (shouldn't happen in practice) — fall back to a simple average
    // rather than dividing by zero.
    const avgX = points.reduce((s, p) => s + p[0], 0) / points.length;
    const avgY = points.reduce((s, p) => s + p[1], 0) / points.length;
    return [avgX, avgY];
  }
  return [cx / (6 * area), cy / (6 * area)];
}

// Decides how a room's name label should be laid out so it never visually overflows into a
// neighboring room. A narrow-but-long room (a hallway, say) gets its label rotated to run
// along the longer dimension at full size, which reads far better than shrinking to near-
// illegibility — verified with real character-width estimates against both reported cases
// (a 1m-wide "hallway2" and "hallway") before implementing, confirming normal-width rooms
// are left untouched and only genuinely narrow ones are affected.
function roomLabelLayout(name: string, widthM: number, lengthM: number): { mode: "normal" | "rotated" | "scaled"; fontSize: number } {
  const DEFAULT_SIZE = 12;
  const MIN_SIZE = 7;
  const MARGIN_PX = 8;
  const AVG_CHAR_WIDTH_FACTOR = 0.62; // reasonable estimate for this bold sans-serif font
  const naturalWidth = name.length * AVG_CHAR_WIDTH_FACTOR * DEFAULT_SIZE;
  const widthPx = widthM * PIXELS_PER_METRE;
  const lengthPx = lengthM * PIXELS_PER_METRE;

  if (naturalWidth <= widthPx - MARGIN_PX) return { mode: "normal", fontSize: DEFAULT_SIZE };
  if (widthM < lengthM && naturalWidth <= lengthPx - MARGIN_PX) return { mode: "rotated", fontSize: DEFAULT_SIZE };

  const availablePx = widthM < lengthM ? lengthPx - MARGIN_PX : widthPx - MARGIN_PX;
  const scaled = DEFAULT_SIZE * (availablePx / naturalWidth);
  return { mode: "scaled", fontSize: Math.max(MIN_SIZE, Math.min(DEFAULT_SIZE, scaled)) };
}

// Standard conversion factor, verified against the known reference (100 sqm = ~1076 sqft)
// before use.
const SQFT_PER_SQM = 10.7639;
function formatAreaBoth(m2: number) {
  return `${m2.toFixed(1)} m² (${(m2 * SQFT_PER_SQM).toFixed(0)} sq ft)`;
}
const ROOM_COLORS = ["#E7F0EC", "#FFEDD5", "#F0E7EC", "#E7ECF0", "#FBF0E7", "#EAE7F0"];

function emptyRoom(): Room {
  return { name: "", widthM: "", lengthM: "", shape: "rectangle" };
}

// Splices a bay window's protrusion onto any base polygon that has a plain, unmodified
// bottom edge - present as an adjacent [w,l] -> [0,l] pair in every shape except a
// bottom-left/bottom-right notch or angled corner, which already modifies that exact edge
// itself. Returns null when that pair can't be found (the base shape's own modifier already
// touches the bottom edge), so the caller can gracefully fall back to the base shape alone
// rather than risk producing broken, self-intersecting geometry from two modifiers fighting
// over the same edge. Verified with the shoelace formula against multiple different base
// shapes before relying on this, matching the same standard of care already established for
// every individual shape in this file.
function addBayWindowToPolygon(points: number[][], w: number, l: number, bw: number, bd: number): number[][] | null {
  const brIndex = points.findIndex(([x, y]) => x === w && y === l);
  const blIndex = points.findIndex(([x, y]) => x === 0 && y === l);
  if (brIndex === -1 || blIndex === -1 || blIndex !== brIndex + 1) return null;
  const bayPoints = [
    [(w + bw) / 2, l],
    [(w + bw) / 2 - bd, l + bd],
    [(w - bw) / 2 + bd, l + bd],
    [(w - bw) / 2, l],
  ];
  return [...points.slice(0, brIndex + 1), ...bayPoints, ...points.slice(blIndex)];
}

// Returns the room's own local-coordinate polygon points (before layout translation) for
// whichever primary shape it is - deliberately kept as its own, unmodified function so none
// of this already-verified shape logic needs to change at all; roomGeometry below wraps this
// with the separate, independently-combinable bay window add-on.
function computeBaseRoomGeometry(room: {
  widthM: number;
  lengthM: number;
  shape: string;
  bayWidthM?: number;
  bayDepthM?: number;
  notchWidthM?: number;
  notchDepthM?: number;
  notchCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  angledCutWidthM?: number;
  angledCutDepthM?: number;
  angledCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  trapezoidTopWidthM?: number;
  trapezoidSide?: "left" | "right" | "both";
  slopedTopAmountM?: number;
  slopedTopSide?: "left" | "right";
  hasBayWindow?: boolean;
}) {
  const w = room.widthM;
  const l = room.lengthM;

  // Same bounds the server enforces on save (a bay or notch as big as the room itself isn't
  // a genuine bay/notch anymore) — checked here too, so the live preview never renders a
  // broken, inverted polygon while someone's still typing, before validation ever runs.
  // A real bay window has angled ("canted") side panels connecting the front pane back to
  // the main wall, not a square box sticking straight out — this uses a 45-degree angle for
  // the sides (a standard, common bay proportion), so the front panel is narrower than the
  // wall opening by exactly bayDepthM on each side.
  if (
    room.shape === "bay-window" &&
    room.bayWidthM &&
    room.bayDepthM &&
    room.bayWidthM > 0 &&
    room.bayWidthM < w &&
    room.bayDepthM > 0 &&
    room.bayDepthM < l &&
    room.bayWidthM > room.bayDepthM * 2
  ) {
    const bw = room.bayWidthM;
    const bd = room.bayDepthM;
    const points = [
      [0, 0],
      [w, 0],
      [w, l],
      [(w + bw) / 2, l],
      [(w + bw) / 2 - bd, l + bd],
      [(w - bw) / 2 + bd, l + bd],
      [(w - bw) / 2, l],
      [0, l],
    ];
    return { points, footprintHeight: l + bd };
  }

  if (room.shape === "l-shape" && room.notchWidthM && room.notchDepthM && room.notchWidthM > 0 && room.notchWidthM < w && room.notchDepthM > 0 && room.notchDepthM < l) {
    const nw = room.notchWidthM;
    const nd = room.notchDepthM;
    const corner = room.notchCorner || "bottom-right";
    // Each variant verified with the shoelace formula before implementing — same net area
    // (full rectangle minus the notch) and the same clockwise winding as the original,
    // only-ever-supported bottom-right case, confirming each is a genuine, non-self-
    // intersecting mirror of it rather than an accidentally-broken polygon.
    const pointsByCorner: Record<string, number[][]> = {
      "bottom-right": [
        [0, 0],
        [w, 0],
        [w, l - nd],
        [w - nw, l - nd],
        [w - nw, l],
        [0, l],
      ],
      "bottom-left": [
        [0, 0],
        [w, 0],
        [w, l],
        [nw, l],
        [nw, l - nd],
        [0, l - nd],
      ],
      "top-right": [
        [0, 0],
        [w - nw, 0],
        [w - nw, nd],
        [w, nd],
        [w, l],
        [0, l],
      ],
      "top-left": [
        [nw, 0],
        [w, 0],
        [w, l],
        [0, l],
        [0, nd],
        [nw, nd],
      ],
    };
    return { points: pointsByCorner[corner], footprintHeight: l };
  }

  if (
    room.shape === "angled-corner" &&
    room.angledCutWidthM &&
    room.angledCutDepthM &&
    room.angledCutWidthM > 0 &&
    room.angledCutWidthM < w &&
    room.angledCutDepthM > 0 &&
    room.angledCutDepthM < l
  ) {
    const cw = room.angledCutWidthM;
    const cd = room.angledCutDepthM;
    const corner = room.angledCorner || "bottom-right";
    // Verified with the shoelace formula before implementing (correct area for all 4 corners,
    // consistent clockwise winding matching every other shape here) — a triangular cut instead
    // of the L-shape notch's rectangular one. The room's own bounding box (w x l) never
    // changes, so collision detection, auto-layout, dragging, and the resize handles all
    // operate exactly as they already do for a plain rectangle; only this one corner draws
    // as a diagonal line instead of a right angle.
    const pointsByCorner: Record<string, number[][]> = {
      "bottom-right": [
        [0, 0],
        [w, 0],
        [w, l - cd],
        [w - cw, l],
        [0, l],
      ],
      "bottom-left": [
        [0, 0],
        [w, 0],
        [w, l],
        [cw, l],
        [0, l - cd],
      ],
      "top-right": [
        [0, 0],
        [w - cw, 0],
        [w, cd],
        [w, l],
        [0, l],
      ],
      "top-left": [
        [cw, 0],
        [w, 0],
        [w, l],
        [0, l],
        [0, cd],
      ],
    };
    return { points: pointsByCorner[corner], footprintHeight: l };
  }

  if (room.shape === "trapezoid" && room.trapezoidTopWidthM && room.trapezoidTopWidthM > 0 && room.trapezoidTopWidthM < w) {
    const tw = room.trapezoidTopWidthM;
    const side = room.trapezoidSide || "both";
    // Verified with the shoelace formula before implementing — each variant's area matches
    // the standard trapezoid area formula ((top + bottom) / 2 * height) exactly, with the
    // same consistent clockwise winding as every other shape here. widthM stays the room's
    // maximum (bottom) width throughout, so the bounding box never changes — collision
    // detection, auto-layout, dragging, and the resize handles all keep working unchanged.
    const pointsBySide: Record<string, number[][]> = {
      left: [
        [w - tw, 0],
        [w, 0],
        [w, l],
        [0, l],
      ],
      right: [
        [0, 0],
        [tw, 0],
        [w, l],
        [0, l],
      ],
      both: [
        [(w - tw) / 2, 0],
        [(w - tw) / 2 + tw, 0],
        [w, l],
        [0, l],
      ],
    };
    return { points: pointsBySide[side], footprintHeight: l };
  }

  if (room.shape === "sloped-top" && room.slopedTopAmountM && room.slopedTopAmountM > 0 && room.slopedTopAmountM < l) {
    const ts = room.slopedTopAmountM;
    const side = room.slopedTopSide || "left";
    // Verified with the shoelace formula before implementing — area matches the full
    // rectangle minus the triangle sliced off the top exactly, same consistent clockwise
    // winding as every other shape here. lengthM stays the room's maximum (taller-side)
    // length throughout, so the bounding box never changes.
    const pointsBySide: Record<string, number[][]> = {
      left: [
        [0, ts],
        [w, 0],
        [w, l],
        [0, l],
      ],
      right: [
        [0, 0],
        [w, ts],
        [w, l],
        [0, l],
      ],
    };
    return { points: pointsBySide[side], footprintHeight: l };
  }

  return {
    points: [
      [0, 0],
      [w, 0],
      [w, l],
      [0, l],
    ],
    footprintHeight: l,
  };
}

// Wraps computeBaseRoomGeometry with the separate, independently-combinable bay window
// add-on (see hasBayWindow's own comment on the Room type for the full reasoning) - the
// existing shape === "bay-window" case above already produces its own bay and is left
// completely alone here, since combining a second bay window onto a room already using one
// as its primary shape wouldn't mean anything.
function roomGeometry(room: Parameters<typeof computeBaseRoomGeometry>[0] & { hasBayWindow?: boolean }) {
  const base = computeBaseRoomGeometry(room);

  if (
    room.shape !== "bay-window" &&
    room.hasBayWindow &&
    room.bayWidthM &&
    room.bayDepthM &&
    room.bayWidthM > 0 &&
    room.bayWidthM < room.widthM &&
    room.bayDepthM > 0 &&
    room.bayDepthM < room.lengthM &&
    room.bayWidthM > room.bayDepthM * 2
  ) {
    const combined = addBayWindowToPolygon(base.points, room.widthM, room.lengthM, room.bayWidthM, room.bayDepthM);
    if (combined) {
      return { points: combined, footprintHeight: base.footprintHeight + room.bayDepthM };
    }
    // The base shape's own modifier already touches the bottom edge (a bottom-left/
    // bottom-right notch or angled corner) - falls back to the base shape alone rather than
    // risk broken, self-intersecting geometry from two modifiers fighting over the same edge.
  }

  return base;
}

// Standard 2D rotation of a point around a given centre, by angleDeg (clockwise, matching
// SVG's own rotate() convention, so the math here and the visual <g transform="rotate(...)">
// applied to the same room always agree on which direction is "positive").
function rotatePoint(x: number, y: number, cx: number, cy: number, angleDeg: number): number[] {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
}

// Rotates a room's own local-space shape (as returned by roomGeometry) around the room's own
// centre - deliberately the centre of the base widthM x lengthM rectangle, not the centre of
// mass of an irregular shape like a bay window or notch, so rotating a room reads as it
// genuinely spinning in place around its own middle, not around some point shifted off-centre
// by whichever shape modifier happens to be applied.
function rotatedLocalPoints(points: number[][], widthM: number, lengthM: number, rotationDeg: number): number[][] {
  if (!rotationDeg) return points;
  const cx = widthM / 2;
  const cy = lengthM / 2;
  return points.map(([x, y]) => rotatePoint(x, y, cx, cy, rotationDeg));
}

// The room's true axis-aligned bounding box after rotation - generally larger than its own
// un-rotated widthM x lengthM (except at exact 90-degree multiples, where a rectangle's
// bounding box happens to just be its own swapped dimensions). Needed anywhere that reasons
// about how much space a room actually occupies in world coordinates - the shelf-packing
// auto-layout below, most directly - since using the un-rotated widthM/footprintHeight there
// would under-estimate the real footprint of any room rotated to a non-90-degree angle and
// risk packing neighbouring rooms into space the rotated one actually occupies.
function rotatedBoundingBox(localPoints: number[][], widthM: number, lengthM: number, rotationDeg: number): { width: number; height: number; minX: number; minY: number } {
  if (!rotationDeg) {
    const minX = Math.min(...localPoints.map((p) => p[0]));
    const minY = Math.min(...localPoints.map((p) => p[1]));
    return { width: widthM, height: Math.max(...localPoints.map((p) => p[1])) - minY, minX, minY };
  }
  const rotated = rotatedLocalPoints(localPoints, widthM, lengthM, rotationDeg);
  const xs = rotated.map((p) => p[0]);
  const ys = rotated.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { width: Math.max(...xs) - minX, height: Math.max(...ys) - minY, minX, minY };
}

// The smallest widthM/lengthM a room can be resized down to without invalidating its own
// bay-window or L-shape notch — both require the room strictly larger than the protrusion
// or cutout on that axis (per the same bounds roomGeometry and the server both already
// enforce), so shrinking past that would silently produce a broken shape rather than a
// smaller valid one. Falls back to a small absolute floor (a room narrower than this isn't
// meaningful regardless of shape) when there's no shape-specific constraint on that axis.
function minRoomSize(room: {
  shape: string;
  bayWidthM?: number;
  bayDepthM?: number;
  hasBayWindow?: boolean;
  notchWidthM?: number;
  notchDepthM?: number;
  angledCutWidthM?: number;
  angledCutDepthM?: number;
  trapezoidTopWidthM?: number;
  slopedTopAmountM?: number;
}) {
  const ABSOLUTE_MIN = 0.5;
  let minWidth = ABSOLUTE_MIN;
  let minLength = ABSOLUTE_MIN;
  if (room.shape === "bay-window" || room.hasBayWindow) {
    if (room.bayWidthM) minWidth = Math.max(minWidth, room.bayWidthM);
    if (room.bayDepthM) minLength = Math.max(minLength, room.bayDepthM);
  }
  if (room.shape === "l-shape") {
    if (room.notchWidthM) minWidth = Math.max(minWidth, room.notchWidthM);
    if (room.notchDepthM) minLength = Math.max(minLength, room.notchDepthM);
  }
  if (room.shape === "angled-corner") {
    if (room.angledCutWidthM) minWidth = Math.max(minWidth, room.angledCutWidthM);
    if (room.angledCutDepthM) minLength = Math.max(minLength, room.angledCutDepthM);
  }
  if (room.shape === "trapezoid") {
    if (room.trapezoidTopWidthM) minWidth = Math.max(minWidth, room.trapezoidTopWidthM);
  }
  if (room.shape === "sloped-top") {
    if (room.slopedTopAmountM) minLength = Math.max(minLength, room.slopedTopAmountM);
  }
  return { minWidth, minLength };
}

// Reorders rooms so ones connected to each other end up adjacent in the sequence fed to
// computeLayout's shelf-packing below — connected rooms landing near each other in that
// packing is what actually produces a floor plan that reads as connected, rather than one
// where a "Kitchen" and its adjoining "Living room" could end up on opposite sides of the
// plan purely because of the arbitrary order they were added in. A breadth-first traversal
// of the connection graph does this without needing a full architectural layout solver —
// disconnected rooms (no connections to anything) simply keep their original relative order,
// appended once every connected group ahead of them has been placed.
//
// Tracks visited/ordered state by each room's unique index, not by name — room names aren't
// guaranteed unique (two rooms can share a name before someone disambiguates them), and an
// earlier version of this keyed by name alone, confirmed via direct testing to silently drop
// one of two same-named rooms from the result entirely.
function bfsOrderRooms<T extends { i: number; name: string }>(roomsToOrder: T[], allRooms: Room[]): T[] {
  const roomsByName = new Map<string, T[]>();
  for (const room of roomsToOrder) {
    if (!roomsByName.has(room.name)) roomsByName.set(room.name, []);
    roomsByName.get(room.name)!.push(room);
  }

  const adjacency = new Map<number, Set<number>>();
  const addEdge = (aI: number, bI: number) => {
    if (!adjacency.has(aI)) adjacency.set(aI, new Set());
    adjacency.get(aI)!.add(bI);
  };
  for (const room of roomsToOrder) {
    const roomData = allRooms[room.i];
    if (!roomData?.connectedTo) continue;
    for (const otherName of roomData.connectedTo) {
      for (const target of roomsByName.get(otherName) || []) {
        addEdge(room.i, target.i);
        addEdge(target.i, room.i);
      }
    }
  }

  const byIndex = new Map(roomsToOrder.map((r) => [r.i, r]));
  const visited = new Set<number>();
  const ordered: T[] = [];

  // Each disconnected group starts from its own most-connected room rather than whichever
  // happens to be first in the original array — a hub room (a hallway many others open onto,
  // say) anchoring its own group's traversal is a more sensible root than an arbitrary pick,
  // and matters most for which group ends up placed first in the packing that follows.
  const startOrder = [...roomsToOrder].sort((a, b) => (adjacency.get(b.i)?.size || 0) - (adjacency.get(a.i)?.size || 0));

  for (const start of startOrder) {
    if (visited.has(start.i)) continue;
    const queue = [start.i];
    visited.add(start.i);
    while (queue.length > 0) {
      const currentI = queue.shift()!;
      const currentRoom = byIndex.get(currentI);
      if (currentRoom) ordered.push(currentRoom);
      for (const neighborI of adjacency.get(currentI) || []) {
        if (!visited.has(neighborI)) {
          visited.add(neighborI);
          queue.push(neighborI);
        }
      }
    }
  }
  return ordered;
}

// Simple "shelf packing" layout — places rooms left to right, wrapping to a new row once the
// current row would exceed a target width. Uses each room's real footprint height (which for
// a bay window includes the protrusion) rather than just lengthM, so a bay never overlaps the
// room below it. This is a block-diagram layout, not a true architectural plan with
// connecting walls and doors — that's a genuinely different, much harder problem. Rooms fed
// in here should already be ordered by bfsOrderRooms above when possible, so that connected
// rooms land near each other in this packing rather than wherever arbitrary array order
// happens to place them.
function computeLayout(
  rooms: {
    i: number;
    name: string;
    widthM: number;
    lengthM: number;
    xM?: number;
    yM?: number;
    shape: string;
    bayWidthM?: number;
    bayDepthM?: number;
    notchWidthM?: number;
    notchDepthM?: number;
    notchCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    angledCutWidthM?: number;
    angledCutDepthM?: number;
    angledCorner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
    trapezoidTopWidthM?: number;
    trapezoidSide?: "left" | "right" | "both";
    slopedTopAmountM?: number;
    slopedTopSide?: "left" | "right";
    hasBayWindow?: boolean;
    rotationDeg?: number;
  }[]
) {
  if (rooms.length === 0) return { positioned: [], totalWidth: 0, totalHeight: 0 };

  // The rotated bounding box (not the room's own un-rotated widthM/footprintHeight) is what
  // actually determines how much space this room needs reserved in the packing below - a
  // room rotated to a non-90-degree angle has a real, larger footprint than its own
  // dimensions, and under-estimating that here would risk the packing placing a neighbouring
  // room where the rotated one's true bounds actually extend to.
  const withGeometry = rooms.map((r) => {
    const geometry = roomGeometry(r);
    const bbox = rotatedBoundingBox(geometry.points, r.widthM, r.lengthM, r.rotationDeg || 0);
    return { ...r, geometry, packWidth: bbox.width, packHeight: bbox.height };
  });
  const totalArea = withGeometry.reduce((sum, r) => sum + r.packWidth * r.packHeight, 0);
  const targetWidth = Math.max(Math.sqrt(totalArea) * 1.3, Math.max(...withGeometry.map((r) => r.packWidth)));

  let currentX = 0;
  let currentY = 0;
  let rowHeight = 0;

  const positioned = withGeometry.map((room) => {
    if (currentX > 0 && currentX + room.packWidth > targetWidth) {
      currentX = 0;
      currentY += rowHeight;
      rowHeight = 0;
    }
    const autoX = currentX;
    const autoY = currentY;
    currentX += room.packWidth;
    rowHeight = Math.max(rowHeight, room.packHeight);

    const x = room.xM ?? autoX;
    const y = room.yM ?? autoY;
    return { ...room, x, y, color: ROOM_COLORS[room.i % ROOM_COLORS.length] };
  });

  const totalWidth = Math.max(...positioned.map((r) => r.x + r.packWidth), 0);
  const totalHeight = Math.max(...positioned.map((r) => r.y + r.packHeight), 0);

  return { positioned, totalWidth, totalHeight };
}

// Shrinks a polygon slightly toward its own centroid. Two rooms merely sharing a wall — the
// normal, expected case for virtually every adjacent room pair in a floor plan — share exact
// boundary points or whole edges, which a strict edge-intersection/containment test would
// wrongly flag as overlapping. This tiny inward shrink (a simple, safe approximation rather
// than a true polygon offset, but sufficient at real room scale) separates touching-but-not-
// overlapping boundaries by a couple of centimetres before testing, while genuine area
// overlaps — which are never that small in practice — still test as overlapping.
function shrinkPolygon(points: number[][], factor = 0.02): number[][] {
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return points.map(([x, y]) => [cx + (x - cx) * (1 - factor), cy + (y - cy) * (1 - factor)]);
}

// Standard orientation test for three points: 0 = collinear, 1 = clockwise, 2 =
// counter-clockwise. Used by segmentsIntersect below.
function orientation(p: number[], q: number[], r: number[]): number {
  const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

// Given p, q, r are collinear, checks whether q lies on segment pr.
function onSegment(p: number[], q: number[], r: number[]): boolean {
  return q[0] <= Math.max(p[0], r[0]) + 1e-9 && q[0] >= Math.min(p[0], r[0]) - 1e-9 && q[1] <= Math.max(p[1], r[1]) + 1e-9 && q[1] >= Math.min(p[1], r[1]) - 1e-9;
}

// Standard general-case-plus-collinear-special-cases segment intersection test.
function segmentsIntersect(p1: number[], q1: number[], p2: number[], q2: number[]): boolean {
  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) return true;

  if (o1 === 0 && onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && onSegment(p2, q1, q2)) return true;

  return false;
}

// Ray-casting point-in-polygon test: casts a ray in the +x direction from the point and
// counts edge crossings — odd means inside, even means outside. Works correctly for
// non-convex polygons like L-shapes, unlike a simple bounding-box containment check.
function pointInPolygon(point: number[], polygon: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];
    const intersects = yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// True polygon-vs-polygon overlap: any edge of one crossing any edge of the other, or any
// vertex of either sitting inside the other. Correctly handles non-convex shapes (L-shapes,
// bay windows) where a bounding-box check would produce false positives — e.g. an L-shaped
// garden whose notch is precisely carved out to wrap around a house room without actually
// touching it still has a rectangular bounding box that overlaps that room's.
function polygonsOverlap(polyA: number[][], polyB: number[][]): boolean {
  for (let i = 0; i < polyA.length; i++) {
    const a1 = polyA[i];
    const a2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const b1 = polyB[j];
      const b2 = polyB[(j + 1) % polyB.length];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  if (polyA.some((p) => pointInPolygon(p, polyB))) return true;
  if (polyB.some((p) => pointInPolygon(p, polyA))) return true;
  return false;
}

// True polygon-vs-polygon overlap check, using each room's actual carved-out shape (notch,
// bay, angled cut, etc.) rather than its rectangular bounding box — a bounding-box check
// would falsely flag shapes like an L-shaped garden wrapping around a house room as
// overlapping, even when the actual polygons don't touch, since the point of the notch is
// precisely to carve out the space the other room occupies.
function detectCollisions(
  positioned: { i: number; x: number; y: number; widthM: number; lengthM: number; rotationDeg?: number; geometry: { footprintHeight: number; points: number[][] } }[]
): Set<number> {
  const overlapping = new Set<number>();
  const worldPolygons = positioned.map((r) =>
    shrinkPolygon(rotatedLocalPoints(r.geometry.points, r.widthM, r.lengthM, r.rotationDeg || 0).map(([px, py]) => [px + r.x, py + r.y]))
  );
  for (let a = 0; a < positioned.length; a++) {
    for (let b = a + 1; b < positioned.length; b++) {
      if (polygonsOverlap(worldPolygons[a], worldPolygons[b])) {
        overlapping.add(positioned[a].i);
        overlapping.add(positioned[b].i);
      }
    }
  }
  return overlapping;
}

type RoomBox = { x: number; y: number; widthM: number; footprintHeight: number };

// Checks whether two rooms' bounding boxes genuinely share a wall (one room's edge sits
// right against the other's, with enough overlap along that edge for a real door) rather
// than just being somewhere near each other. Uses bounding boxes, not the exact irregular
// polygon shape, for the same reason collision detection does — true polygon-edge matching
// for bay windows and L-shapes would be a genuinely harder problem.
function findSharedWall(a: RoomBox, b: RoomBox): { orientation: "vertical" | "horizontal"; wallPos: number; doorStart: number; doorEnd: number } | null {
  const TOLERANCE = 0.15; // metres — accounts for imprecise dragging, not exact pixel alignment
  const MIN_DOOR_SPAN = 0.6; // metres — below this, there's not really room for a doorway

  for (const [left, right] of [
    [a, b],
    [b, a],
  ] as const) {
    if (Math.abs(left.x + left.widthM - right.x) < TOLERANCE) {
      const overlapStart = Math.max(left.y, right.y);
      const overlapEnd = Math.min(left.y + left.footprintHeight, right.y + right.footprintHeight);
      if (overlapEnd - overlapStart >= MIN_DOOR_SPAN) {
        return { orientation: "vertical", wallPos: left.x + left.widthM, doorStart: overlapStart, doorEnd: overlapEnd };
      }
    }
  }

  for (const [top, bottom] of [
    [a, b],
    [b, a],
  ] as const) {
    if (Math.abs(top.y + top.footprintHeight - bottom.y) < TOLERANCE) {
      const overlapStart = Math.max(top.x, bottom.x);
      const overlapEnd = Math.min(top.x + top.widthM, bottom.x + bottom.widthM);
      if (overlapEnd - overlapStart >= MIN_DOOR_SPAN) {
        return { orientation: "horizontal", wallPos: top.y + top.footprintHeight, doorStart: overlapStart, doorEnd: overlapEnd };
      }
    }
  }

  return null;
}

// A realistic door width, centred on the available wall span and clamped so it never eats
// more than 60% of the shared wall — leaving genuine wall on both sides rather than a gap
// that spans almost the entire shared edge.
function doorGap(doorStart: number, doorEnd: number, doorWidth = 0.9) {
  const span = doorEnd - doorStart;
  const width = Math.min(doorWidth, span * 0.6);
  const center = (doorStart + doorEnd) / 2;
  return { start: center - width / 2, end: center + width / 2 };
}

// A door straight through the room's own exterior wall (main entrance, rear garden door),
// as opposed to doorGap above which is for a door shared between two connected rooms.
// Clamped so a door dragged near a corner never produces a gap that overflows past the
// wall's own actual length — verified with concrete numbers across wall sides and edge
// positions before being wired into rendering.
const EXTERIOR_DOOR_WIDTH = 0.9;
function exteriorDoorGap(wall: "top" | "bottom" | "left" | "right", positionM: number, widthM: number, lengthM: number) {
  const half = EXTERIOR_DOOR_WIDTH / 2;
  if (wall === "top" || wall === "bottom") {
    const start = Math.max(0, positionM - half);
    const end = Math.min(widthM, positionM + half);
    return { axis: "x" as const, start, end, fixed: wall === "top" ? 0 : lengthM };
  }
  const start = Math.max(0, positionM - half);
  const end = Math.min(lengthM, positionM + half);
  return { axis: "y" as const, start, end, fixed: wall === "left" ? 0 : widthM };
}

// A window marker on a room's exterior wall — same wall/position architecture as
// exteriorDoorGap, just a typical UK window width (1.2m) rather than a door's 0.9m.
const WINDOW_WIDTH = 1.2;
function windowGap(wall: "top" | "bottom" | "left" | "right", positionM: number, widthM: number, lengthM: number) {
  const half = WINDOW_WIDTH / 2;
  if (wall === "top" || wall === "bottom") {
    const start = Math.max(0, positionM - half);
    const end = Math.min(widthM, positionM + half);
    return { axis: "x" as const, start, end, fixed: wall === "top" ? 0 : lengthM };
  }
  const start = Math.max(0, positionM - half);
  const end = Math.min(lengthM, positionM + half);
  return { axis: "y" as const, start, end, fixed: wall === "left" ? 0 : widthM };
}

// Matches the standard convention seen across real UK floor plans — a run of evenly-spaced
// parallel lines along the stairs' longer dimension, using a typical ~0.25m stair-tread
// depth, capped at a sensible number so a long room doesn't produce a cluttered ladder of
// lines. Runs along whichever axis is longer, since a staircase room is almost always a
// narrow rectangle rather than square.
// Snaps a room being dragged to align with a nearby room's edges when close enough — the
// same left/right/top/bottom alignment candidates verified with concrete numbers before
// being implemented here. Each axis snaps independently, so a room can align horizontally
// with one room while aligning vertically with a different one.
function snapPosition(
  tentativeX: number,
  tentativeY: number,
  widthM: number,
  heightM: number,
  others: { x: number; y: number; w: number; h: number }[],
  threshold = 0.15
) {
  let snappedX = tentativeX;
  let snappedY = tentativeY;
  let bestXDist = threshold;
  let bestYDist = threshold;
  const dLeft = tentativeX;
  const dRight = tentativeX + widthM;
  const dTop = tentativeY;
  const dBottom = tentativeY + heightM;

  for (const o of others) {
    const oLeft = o.x;
    const oRight = o.x + o.w;
    const oTop = o.y;
    const oBottom = o.y + o.h;

    const xCandidates: [number, number][] = [
      [Math.abs(dLeft - oLeft), oLeft],
      [Math.abs(dLeft - oRight), oRight],
      [Math.abs(dRight - oLeft), oLeft - widthM],
      [Math.abs(dRight - oRight), oRight - widthM],
    ];
    for (const [dist, snap] of xCandidates) {
      if (dist < bestXDist) {
        bestXDist = dist;
        snappedX = snap;
      }
    }

    const yCandidates: [number, number][] = [
      [Math.abs(dTop - oTop), oTop],
      [Math.abs(dTop - oBottom), oBottom],
      [Math.abs(dBottom - oTop), oTop - heightM],
      [Math.abs(dBottom - oBottom), oBottom - heightM],
    ];
    for (const [dist, snap] of yCandidates) {
      if (dist < bestYDist) {
        bestYDist = dist;
        snappedY = snap;
      }
    }
  }

  return { x: Math.max(0, snappedX), y: Math.max(0, snappedY) };
}

function stairSteps(widthM: number, lengthM: number) {
  const STEP_DEPTH = 0.25;
  const MIN_STEPS = 4;
  const MAX_STEPS = 16;
  const vertical = lengthM >= widthM;
  const runLength = vertical ? lengthM : widthM;
  const numSteps = Math.max(MIN_STEPS, Math.min(MAX_STEPS, Math.round(runLength / STEP_DEPTH)));
  const positions = Array.from({ length: numSteps }, (_, i) => ((i + 1) * runLength) / (numSteps + 1));
  return { vertical, positions };
}

type RoomFixtureType = "bath" | "shower" | "toilet" | "basin" | "sink" | "hob" | "bed" | "wardrobe" | "sofa" | "coffee-table";

// Inferred from the room's own name — a lightweight, honest heuristic rather than true room
// classification, matching how someone would naturally read a floor plan label themselves.
function detectRoomTypes(name: string): ("bathroom" | "kitchen" | "bedroom" | "livingroom")[] {
  const n = name.toLowerCase();
  const types: ("bathroom" | "kitchen" | "bedroom" | "livingroom")[] = [];
  if (/\b(bathroom|bath|shower|wc|toilet|ensuite|en-suite|cloakroom)/.test(n)) types.push("bathroom");
  if (/\bkitchen/.test(n)) types.push("kitchen");
  if (/\bbedroom/.test(n)) types.push("bedroom");
  if (/\b(living room|lounge|sitting room|reception room)/.test(n)) types.push("livingroom");
  return types;
}

// Typical UK fixture footprints in metres, placed in a single row along the room's top wall
// and scaled down together (fixed-size gaps between them) if the room is too small to fit
// them at full size — verified against several room sizes before implementing the render
// logic, so the fixtures never overflow the room's own bounding box.
function roomFixtures(
  roomType: "bathroom" | "kitchen" | "bedroom" | "livingroom",
  widthM: number,
  lengthM: number,
  manualPositions: { type: string; xM: number; yM: number; rotated?: boolean; mirrored?: boolean }[] | undefined,
  enabledFixtures: string[] | undefined,
  rowYOffsetM: number = 0
) {
  const defsByType: Record<typeof roomType, { type: RoomFixtureType; w: number; d: number }[]> = {
    bathroom: [
      { type: "bath", w: 1.7, d: 0.7 },
      { type: "shower", w: 0.9, d: 0.9 },
      { type: "toilet", w: 0.4, d: 0.6 },
      { type: "basin", w: 0.5, d: 0.4 },
    ],
    kitchen: [
      { type: "sink", w: 0.6, d: 0.5 },
      { type: "hob", w: 0.5, d: 0.5 },
    ],
    bedroom: [
      { type: "bed", w: 1.35, d: 1.9 },
      { type: "wardrobe", w: 1.2, d: 0.6 },
    ],
    livingroom: [
      { type: "sofa", w: 2.0, d: 0.9 },
      { type: "coffee-table", w: 1.0, d: 0.5 },
    ],
  };
  const allDefs = defsByType[roomType];

  // undefined (never explicitly set) falls back to a sensible default set, rather than
  // showing nothing — the original set for each room type before toggling existed, so
  // already-saved rooms don't lose fixtures. An explicitly-set list (even an empty one) is
  // respected exactly as given.
  const defaultEnabledByType: Record<typeof roomType, string[]> = {
    bathroom: ["bath", "toilet", "basin"],
    kitchen: ["sink", "hob"],
    bedroom: ["bed", "wardrobe"],
    livingroom: ["sofa", "coffee-table"],
  };
  const activeTypes = enabledFixtures ?? defaultEnabledByType[roomType];
  const defs = allDefs.filter((f) => activeTypes.includes(f.type));

  const MARGIN = 0.1;
  const GAP = 0.1;

  // Rotation is resolved before any sizing math runs, so both the overall scale factor and
  // the auto-layout row spacing use each fixture's genuine post-rotation footprint — using
  // the un-rotated width here would misjudge how much room a rotated fixture actually needs
  // and throw off where subsequent fixtures land in the row.
  const rotatedDefs = defs.map((f) => {
    const manual = manualPositions?.find((m) => m.type === f.type);
    return manual?.rotated ? { ...f, w: f.d, d: f.w } : f;
  });

  const totalGaps = GAP * Math.max(0, rotatedDefs.length - 1);
  const totalFixtureWidth = rotatedDefs.reduce((sum, f) => sum + f.w, 0);
  const available = widthM - MARGIN * 2 - totalGaps;
  const scale = totalFixtureWidth > 0 ? Math.max(0, Math.min(1, available / totalFixtureWidth)) : 1;

  let autoX = MARGIN;
  return rotatedDefs.map((f) => {
    const fw = f.w * scale;
    const fd = f.d * scale;
    const rowX = autoX;
    autoX += fw + GAP;

    const manual = manualPositions?.find((m) => m.type === f.type);
    // Clamped so a fixture dragged far outside the room (or left over from before the room
    // was resized smaller) always stays fully within the room's own bounds, regardless of
    // where it was actually dropped.
    const x = manual ? Math.max(0, Math.min(manual.xM, widthM - fw)) : rowX;
    const y = manual ? Math.max(0, Math.min(manual.yM, lengthM - fd)) : rowYOffsetM + MARGIN;

    return { type: f.type, x, y, w: fw, d: fd, mirrored: !!manual?.mirrored };
  });
}

// Lays out fixtures for every active room type together, stacking each type as its own row
// below the previous one — verified with real fixture depths before implementing that
// stacked rows never overlap, since each row starts only after the previous row's tallest
// fixture (plus a gap) fully ends. Lets a room like "Bedroom with Ensuite" genuinely show
// both bedroom and bathroom fixtures at once, not just whichever type is checked first.
function allRoomFixtures(
  roomTypes: ("bathroom" | "kitchen" | "bedroom" | "livingroom")[],
  widthM: number,
  lengthM: number,
  manualPositions: { type: string; xM: number; yM: number; rotated?: boolean; mirrored?: boolean }[] | undefined,
  enabledFixtures: string[] | undefined
) {
  const GAP = 0.1;
  let yOffset = 0;
  const all: ReturnType<typeof roomFixtures> = [];
  for (const type of roomTypes) {
    const rowFixtures = roomFixtures(type, widthM, lengthM, manualPositions, enabledFixtures, yOffset);
    all.push(...rowFixtures);
    const rowMaxDepth = rowFixtures.reduce((max, f) => Math.max(max, f.d), 0);
    yOffset += rowMaxDepth + GAP;
  }
  return all;
}

export default function FloorPlanEditor({ propertyId, initialLevels }: { propertyId: string; initialLevels: Level[] }) {
  const router = useRouter();
  const [levels, setLevels] = useState<Level[]>(initialLevels.length > 0 ? initialLevels : [{ name: "Ground floor", rooms: [emptyRoom()] }]);
  const [activeLevel, setActiveLevel] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiDimensionsEstimated, setAiDimensionsEstimated] = useState(false);

  // Undo/redo history for the whole floor plan. A ref (not state) since pushing to it must
  // never itself trigger a re-render — only the actual levels state change should do that.
  // "past"/"future" hold full snapshots of levels; commitHistory pushes the state as it was
  // right before a change, and any new change clears "future" since the old redo path is no
  // longer valid once the timeline branches.
  const historyRef = useRef<{ past: Level[][]; future: Level[][] }>({ past: [], future: [] });
  const lastCommitTimeRef = useRef(0);
  // Tracks whether a drag gesture (room/fixture/door/window) is currently active, and whether
  // it has already committed a history entry. A drag can genuinely pause mid-gesture for over
  // the debounce window — someone carefully lining up a fixture, say — without ever releasing
  // the pointer, so time alone can't reliably tell "still the same drag" from "a new one".
  // Explicit start/end boundaries make that precise regardless of how long any pause lasts.
  const isDraggingRef = useRef(false);
  const dragHasCommittedRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0); // bumped to re-render so the undo/redo buttons' enabled state stays in sync
  const MAX_HISTORY = 50;

  const commitHistory = (snapshot: Level[]) => {
    historyRef.current.past.push(snapshot);
    if (historyRef.current.past.length > MAX_HISTORY) historyRef.current.past.shift();
    historyRef.current.future = [];
    setHistoryVersion((v) => v + 1);
  };

  // Rapid-fire updates (every pointer-move during a drag, every keystroke while typing a room
  // name) should collapse into a single undo step, not one per event. A commit only happens
  // if enough time has passed since the last one — the first update in a burst commits, every
  // update within the following window is treated as part of that same gesture.
  const DEBOUNCE_MS = 800;
  const maybeCommitHistory = (snapshot: Level[]) => {
    if (isDraggingRef.current) {
      if (!dragHasCommittedRef.current) {
        commitHistory(snapshot);
        dragHasCommittedRef.current = true;
      }
      return;
    }
    const now = Date.now();
    if (now - lastCommitTimeRef.current > DEBOUNCE_MS) {
      commitHistory(snapshot);
    }
    lastCommitTimeRef.current = now;
  };

  const undo = () => {
    const prev = historyRef.current.past.pop();
    if (!prev) return;
    historyRef.current.future.push(levels);
    setLevels(prev);
    setSaved(false);
    setHistoryVersion((v) => v + 1);
  };

  const redo = () => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(levels);
    setLevels(next);
    setSaved(false);
    setHistoryVersion((v) => v + 1);
  };

  // Safety net for the drag-boundary tracking above: if a drag's own pointerup handler
  // somehow never fires (losing window focus mid-drag, say), isDraggingRef would otherwise
  // stay stuck true forever, silently treating every future edit — even unrelated typing —
  // as part of one endless drag that never gets its own undo step. A global listener that
  // isn't tied to any specific drag element gives this a reliable fallback.
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener("pointerup", handleGlobalPointerUp);
    return () => window.removeEventListener("pointerup", handleGlobalPointerUp);
  }, []);

  // Ctrl/Cmd+Z to undo, Ctrl/Cmd+Shift+Z or Ctrl+Y to redo — skipped while focus is inside a
  // text input so the browser's own native text-undo keeps working normally there, rather
  // than undoing the whole floor plan out from under whatever the person is typing.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if (isTextInput) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const rooms = levels[activeLevel]?.rooms ?? [];

  const updateRooms = (updater: (rooms: Room[]) => Room[]) => {
    maybeCommitHistory(levels);
    setLevels((prev) => prev.map((lvl, i) => (i === activeLevel ? { ...lvl, rooms: updater(lvl.rooms) } : lvl)));
    setSaved(false);
  };

  const updateRoom = (index: number, patch: Partial<Room>) => {
    updateRooms((rs) => {
      const oldName = rs[index]?.name.trim();
      const updated = rs.map((r, i) => (i === index ? { ...r, ...patch } : r));
      // If the name actually changed, every other room's connectedTo and flip-preference
      // lists need the old name swapped for the new one — otherwise a door connection (or
      // its flip preferences) silently breaks the moment either side of it gets renamed,
      // with no visible error to explain why.
      if (patch.name !== undefined && oldName && patch.name.trim() !== oldName) {
        const newName = patch.name.trim();
        return updated.map((r, i) => {
          if (i === index) return r;
          const needsConnectedToUpdate = r.connectedTo?.includes(oldName);
          const needsSwingFlipUpdate = r.flippedSwingConnections?.includes(oldName);
          const needsHingeFlipUpdate = r.flippedHingeConnections?.includes(oldName);
          if (!needsConnectedToUpdate && !needsSwingFlipUpdate && !needsHingeFlipUpdate) return r;
          return {
            ...r,
            connectedTo: needsConnectedToUpdate ? r.connectedTo!.map((n) => (n === oldName ? newName : n)) : r.connectedTo,
            flippedSwingConnections: needsSwingFlipUpdate ? r.flippedSwingConnections!.map((n) => (n === oldName ? newName : n)) : r.flippedSwingConnections,
            flippedHingeConnections: needsHingeFlipUpdate ? r.flippedHingeConnections!.map((n) => (n === oldName ? newName : n)) : r.flippedHingeConnections,
          };
        });
      }
      return updated;
    });
  };

  const addRoom = () => updateRooms((rs) => [...rs, emptyRoom()]);
  const removeRoom = (index: number) => updateRooms((rs) => rs.filter((_, i) => i !== index));

  const copyRoom = (index: number) => {
    updateRooms((rs) => {
      const source = rs[index];
      if (!source) return rs;
      const copy: Room = {
        ...source,
        name: `${source.name.trim() || "Room"} (copy)`,
        xM: undefined,
        yM: undefined,
        // A copy's own position, shape, dimensions, and fixtures carry over — but its
        // relationships to OTHER rooms don't, since the copy will likely end up positioned
        // somewhere different and shouldn't silently claim the original's door connections
        // or cross-floor stair link.
        connectedTo: undefined,
        flippedSwingConnections: undefined,
        flippedHingeConnections: undefined,
        stairLinkFloor: undefined,
        stairLinkRoom: undefined,
        fixturePositions: source.fixturePositions ? source.fixturePositions.map((f) => ({ ...f })) : undefined,
        enabledFixtures: source.enabledFixtures ? [...source.enabledFixtures] : undefined,
        exteriorDoors: source.exteriorDoors ? source.exteriorDoors.map((d) => ({ ...d })) : undefined,
        windows: source.windows ? source.windows.map((w) => ({ ...w })) : undefined,
        manualRoomTypes: source.manualRoomTypes ? [...source.manualRoomTypes] : undefined,
      };
      return [...rs.slice(0, index + 1), copy, ...rs.slice(index + 1)];
    });
  };

  const resetLayout = () => updateRooms((rs) => rs.map((r) => ({ ...r, xM: undefined, yM: undefined })));

  const addLevel = () => {
    commitHistory(levels);
    setLevels((prev) => [...prev, { name: `Level ${prev.length + 1}`, rooms: [emptyRoom()] }]);
    setActiveLevel(levels.length);
    setSaved(false);
    setAiDimensionsEstimated(false);
    setAiError("");
  };

  const duplicateLevel = () => {
    const source = levels[activeLevel];
    if (!source) return;
    // Deep-copies every array field on each room — sharing the same array reference between
    // the original and the duplicate would mean editing a connection or dragging a fixture
    // on one floor silently mutates the other's data too.
    const duplicatedRooms: Room[] = source.rooms.map((r) => ({
      ...r,
      connectedTo: r.connectedTo ? [...r.connectedTo] : undefined,
      flippedSwingConnections: r.flippedSwingConnections ? [...r.flippedSwingConnections] : undefined,
      flippedHingeConnections: r.flippedHingeConnections ? [...r.flippedHingeConnections] : undefined,
      fixturePositions: r.fixturePositions ? r.fixturePositions.map((f) => ({ ...f })) : undefined,
      enabledFixtures: r.enabledFixtures ? [...r.enabledFixtures] : undefined,
      exteriorDoors: r.exteriorDoors ? r.exteriorDoors.map((d) => ({ ...d })) : undefined,
      windows: r.windows ? r.windows.map((w) => ({ ...w })) : undefined,
      manualRoomTypes: r.manualRoomTypes ? [...r.manualRoomTypes] : undefined,
      // A stair link points at a specific other floor — duplicating the floor shouldn't
      // duplicate the claim to that same link target, since two different floors both
      // linking to the same staircase elsewhere wouldn't make physical sense.
      stairLinkFloor: undefined,
      stairLinkRoom: undefined,
    }));
    commitHistory(levels);
    setLevels((prev) => [...prev, { name: `${source.name} (copy)`, rooms: duplicatedRooms }]);
    setActiveLevel(levels.length);
    setSaved(false);
    setAiDimensionsEstimated(false);
    setAiError("");
  };

  const [aiUploadProgress, setAiUploadProgress] = useState<{ current: number; total: number } | null>(null);

  const generateRoomsFromImage = async (file: File): Promise<{ rooms: Room[]; dimensionsFromSketch: boolean } | { error: string }> => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ai/generate-floor-plan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) return { error: data.error || "AI request failed" };
      if (!data.rooms || data.rooms.length === 0) {
        return { error: "Couldn't find any rooms in that image — try a clearer photo of the sketch, or enter rooms manually." };
      }
      const VALID_SHAPES = ["bay-window", "l-shape", "angled-corner", "trapezoid", "sloped-top"];
      const rooms: Room[] = data.rooms.map((r: any) => ({
        name: r.name,
        widthM: String(r.widthM),
        lengthM: String(r.lengthM),
        shape: VALID_SHAPES.includes(r.shape) ? r.shape : "rectangle",
        bayWidthM: r.bayWidthM != null ? String(r.bayWidthM) : undefined,
        bayDepthM: r.bayDepthM != null ? String(r.bayDepthM) : undefined,
        notchWidthM: r.notchWidthM != null ? String(r.notchWidthM) : undefined,
        notchDepthM: r.notchDepthM != null ? String(r.notchDepthM) : undefined,
        notchCorner: ["top-left", "top-right", "bottom-left", "bottom-right"].includes(r.notchCorner) ? r.notchCorner : undefined,
        angledCutWidthM: r.angledCutWidthM != null ? String(r.angledCutWidthM) : undefined,
        angledCutDepthM: r.angledCutDepthM != null ? String(r.angledCutDepthM) : undefined,
        angledCorner: ["top-left", "top-right", "bottom-left", "bottom-right"].includes(r.angledCorner) ? r.angledCorner : undefined,
        trapezoidTopWidthM: r.trapezoidTopWidthM != null ? String(r.trapezoidTopWidthM) : undefined,
        trapezoidSide: ["left", "right", "both"].includes(r.trapezoidSide) ? r.trapezoidSide : undefined,
        slopedTopAmountM: r.slopedTopAmountM != null ? String(r.slopedTopAmountM) : undefined,
        slopedTopSide: ["left", "right"].includes(r.slopedTopSide) ? r.slopedTopSide : undefined,
        hasBayWindow: r.shape !== "bay-window" && !!r.hasBayWindow,
        connectedTo: Array.isArray(r.connectsTo) ? r.connectsTo : undefined,
      }));
      return { rooms, dimensionsFromSketch: !!data.dimensionsFromSketch };
    } catch (err: any) {
      return { error: err?.message || "Something went wrong reading that sketch" };
    }
  };

  const handleAiUpload = async (files: File[]) => {
    if (files.length === 0) return;
    // Only warn about existing data on THIS floor — a single-file upload replaces just the
    // active floor's room list, matching the original single-image behaviour exactly. With
    // multiple files, only the first one touches the active floor this way; every file after
    // it creates a brand new floor, so there's nothing existing at risk for those.
    const hasExistingData = rooms.some((r) => r.name.trim());
    const confirmMessage =
      files.length > 1
        ? `This will replace all rooms currently on "${levels[activeLevel]?.name}" with the first sketch's layout, and create ${files.length - 1} new floor(s) from the rest. Continue?`
        : `This will replace all rooms currently on "${levels[activeLevel]?.name}" with the AI-generated layout. Continue?`;
    if (hasExistingData && !confirm(confirmMessage)) {
      return;
    }

    setAiGenerating(true);
    setAiError("");
    // One commit up front, before any file is processed — the whole multi-file upload is one
    // logical action from the person's point of view, so a single undo should revert all of
    // it at once, not just the most recently added floor.
    commitHistory(levels);

    const failures: string[] = [];
    let dimensionsEstimatedAny = false;
    let nextNewFloorIndex = levels.length;

    for (let i = 0; i < files.length; i++) {
      setAiUploadProgress(files.length > 1 ? { current: i + 1, total: files.length } : null);
      const result = await generateRoomsFromImage(files[i]);
      if ("error" in result) {
        failures.push(`${files[i].name}: ${result.error}`);
        continue;
      }
      if (!result.dimensionsFromSketch) dimensionsEstimatedAny = true;

      if (i === 0) {
        setLevels((prev) => prev.map((lvl, li) => (li === activeLevel ? { ...lvl, rooms: result.rooms } : lvl)));
      } else {
        const floorIndex = nextNewFloorIndex++;
        setLevels((prev) => [...prev, { name: `Level ${floorIndex + 1}`, rooms: result.rooms }]);
      }
    }

    setAiDimensionsEstimated(dimensionsEstimatedAny);
    setSaved(false);
    setAiUploadProgress(null);
    setAiGenerating(false);
    if (failures.length > 0) {
      setAiError(files.length === 1 ? failures[0] : `${failures.length} of ${files.length} sketches couldn't be read:\n${failures.join("\n")}`);
    }
  };

  const renameLevel = (index: number, name: string) => {
    maybeCommitHistory(levels);
    setLevels((prev) => prev.map((lvl, i) => (i === index ? { ...lvl, name } : lvl)));
    setSaved(false);
  };

  const removeLevel = (index: number) => {
    if (levels.length <= 1) return;
    commitHistory(levels);
    setLevels((prev) => prev.filter((_, i) => i !== index));
    setActiveLevel((prev) => Math.min(prev, levels.length - 2));
    setSaved(false);
    setAiDimensionsEstimated(false);
    setAiError("");
  };

  const validRoomsRaw = rooms
    .map((r, i) => ({
      i,
      name: r.name.trim(),
      widthM: parseFloat(r.widthM),
      lengthM: parseFloat(r.lengthM),
      xM: r.xM,
      yM: r.yM,
      shape: r.shape,
      bayWidthM: r.bayWidthM ? parseFloat(r.bayWidthM) : undefined,
      bayDepthM: r.bayDepthM ? parseFloat(r.bayDepthM) : undefined,
      notchWidthM: r.notchWidthM ? parseFloat(r.notchWidthM) : undefined,
      notchDepthM: r.notchDepthM ? parseFloat(r.notchDepthM) : undefined,
      notchCorner: r.notchCorner,
      angledCutWidthM: r.angledCutWidthM ? parseFloat(r.angledCutWidthM) : undefined,
      angledCutDepthM: r.angledCutDepthM ? parseFloat(r.angledCutDepthM) : undefined,
      angledCorner: r.angledCorner,
      trapezoidTopWidthM: r.trapezoidTopWidthM ? parseFloat(r.trapezoidTopWidthM) : undefined,
      trapezoidSide: r.trapezoidSide,
      slopedTopAmountM: r.slopedTopAmountM ? parseFloat(r.slopedTopAmountM) : undefined,
      slopedTopSide: r.slopedTopSide,
      hasBayWindow: r.hasBayWindow,
      rotationDeg: r.rotationDeg ? parseFloat(r.rotationDeg) : 0,
    }))
    .filter((r) => r.name && r.widthM > 0 && r.widthM <= 30 && r.lengthM > 0 && r.lengthM <= 30);

  const hasOutOfRangeRoom = rooms.some((r) => {
    const w = parseFloat(r.widthM);
    const l = parseFloat(r.lengthM);
    return r.name.trim() && ((w > 30 && !isNaN(w)) || (l > 30 && !isNaN(l)));
  });

  const { positioned, totalWidth, totalHeight } = computeLayout(bfsOrderRooms(validRoomsRaw, rooms));
  const overlappingRoomIndices = detectCollisions(positioned);

  // Deduplicated by which actual pair of rooms is involved (regardless of which room's
  // connectedTo list the reference happens to live in), not by index order — a connection
  // only stored on one side, where that side happens to come later in the room list, was
  // previously discarded entirely rather than just avoiding a duplicate line.
  const doorGaps: { orientation: "vertical" | "horizontal"; wallPos: number; gapStart: number; gapEnd: number; swingIntoPositive: boolean; hingeAtStart: boolean }[] = [];
  const connectionLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const drawnPairs = new Set<string>();
  for (const room of positioned) {
    const roomData = rooms[room.i];
    if (!roomData?.connectedTo) continue;
    for (const name of roomData.connectedTo) {
      const target = positioned.find((p) => rooms[p.i]?.name.trim() === name);
      if (!target) continue;
      const pairKey = [room.i, target.i].sort((a, b) => a - b).join("-");
      if (drawnPairs.has(pairKey)) continue;
      drawnPairs.add(pairKey);

      const wall = findSharedWall(
        { x: room.x, y: room.y, widthM: room.widthM, footprintHeight: room.geometry.footprintHeight },
        { x: target.x, y: target.y, widthM: target.widthM, footprintHeight: target.geometry.footprintHeight }
      );

      if (wall) {
        // The rooms genuinely share a wall — draw a real door gap in it, rather than just a
        // line floating between two room centres.
        const gap = doorGap(wall.doorStart, wall.doorEnd);
        // Swing the door into whichever of the two rooms is larger — a reasonable, common
        // convention for which way a door is actually hung — unless the person has
        // explicitly flipped it via the "flip" button, checked from both rooms since the
        // connection itself could be recorded from either side.
        const roomArea = room.widthM * room.geometry.footprintHeight;
        const targetArea = target.widthM * target.geometry.footprintHeight;
        const largerIsRoom = roomArea >= targetArea;
        const autoSwingIntoPositive =
          wall.orientation === "vertical" ? (largerIsRoom ? room.x >= wall.wallPos : target.x >= wall.wallPos) : largerIsRoom ? room.y >= wall.wallPos : target.y >= wall.wallPos;
        const targetName = rooms[target.i]?.name.trim();
        const roomOwnName = rooms[room.i]?.name.trim();
        const isFlipped =
          (rooms[room.i]?.flippedSwingConnections || []).includes(targetName || "") || (rooms[target.i]?.flippedSwingConnections || []).includes(roomOwnName || "");
        const swingIntoPositive = isFlipped ? !autoSwingIntoPositive : autoSwingIntoPositive;
        const isHingeFlipped =
          (rooms[room.i]?.flippedHingeConnections || []).includes(targetName || "") || (rooms[target.i]?.flippedHingeConnections || []).includes(roomOwnName || "");
        doorGaps.push({ orientation: wall.orientation, wallPos: wall.wallPos, gapStart: gap.start, gapEnd: gap.end, swingIntoPositive, hingeAtStart: !isHingeFlipped });
      } else {
        // Rooms marked as connected but not actually touching (yet) — there's no wall to
        // cut a doorway into, so fall back to a simple connector line as a visual hint that
        // dragging them together would show as a real door instead.
        connectionLines.push({
          x1: room.x * PIXELS_PER_METRE + (room.widthM * PIXELS_PER_METRE) / 2 + 10,
          y1: room.y * PIXELS_PER_METRE + (room.geometry.footprintHeight * PIXELS_PER_METRE) / 2 + 10,
          x2: target.x * PIXELS_PER_METRE + (target.widthM * PIXELS_PER_METRE) / 2 + 10,
          y2: target.y * PIXELS_PER_METRE + (target.geometry.footprintHeight * PIXELS_PER_METRE) / 2 + 10,
        });
      }
    }
  }
  const totalAreaM2 = validRoomsRaw.reduce((sum, r) => sum + r.widthM * r.lengthM, 0);
  const hasManualPositions = rooms.some((r) => r.xM !== undefined || r.yM !== undefined);

  // Sums every floor, not just the active one — uses the same "genuinely valid room" test
  // (named, positive dimensions within the sane 30m ceiling) as the per-floor total, so a
  // stray empty row or a typo'd dimension on another floor doesn't skew the property total.
  // Counted alongside the total specifically so the floor count stays consistent with what's
  // actually being summed — an empty, just-added floor tab with no rooms yet shouldn't count
  // toward "across N floors" any more than it contributes to the area itself.
  const floorsWithValidData = levels.filter((lvl) =>
    lvl.rooms.some((r) => r.name.trim() && parseFloat(r.widthM) > 0 && parseFloat(r.widthM) <= 30 && parseFloat(r.lengthM) > 0 && parseFloat(r.lengthM) <= 30)
  ).length;

  const propertyTotalAreaM2 = levels.reduce(
    (sum, lvl) =>
      sum +
      lvl.rooms
        .filter((r) => r.name.trim() && parseFloat(r.widthM) > 0 && parseFloat(r.widthM) <= 30 && parseFloat(r.lengthM) > 0 && parseFloat(r.lengthM) <= 30)
        .reduce((roomSum, r) => roomSum + parseFloat(r.widthM) * parseFloat(r.lengthM), 0),
    0
  );

  // rawX/rawY track where the room "actually" is based purely on accumulated mouse movement,
  // completely separate from the snapped value shown/saved as xM/yM — without this, snapping
  // the displayed position would corrupt the next delta calculation, since it would compute
  // from the snapped position instead of where the mouse genuinely is, causing the room to
  // drift out of sync with the pointer more and more with every snap.
  const dragRef = useRef<{ roomIndex: number; lastClientX: number; lastClientY: number; rawX: number; rawY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointerDown = (e: React.PointerEvent, room: (typeof positioned)[number]) => {
    dragRef.current = { roomIndex: room.i, lastClientX: e.clientX, lastClientY: e.clientY, rawX: room.x, rawY: room.y };
    (e.target as Element).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragHasCommittedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { roomIndex, lastClientX, lastClientY, rawX, rawY } = dragRef.current;
    const deltaXm = (e.clientX - lastClientX) / PIXELS_PER_METRE;
    const deltaYm = (e.clientY - lastClientY) / PIXELS_PER_METRE;
    // The delta always accumulates onto rawX/rawY, never onto the potentially-snapped
    // displayed position — this is what keeps the room's movement in sync with the mouse
    // even while snapping is actively pulling the displayed position to a nearby edge.
    const nextRawX = Math.max(0, rawX + deltaXm);
    const nextRawY = Math.max(0, rawY + deltaYm);
    dragRef.current = { roomIndex, lastClientX: e.clientX, lastClientY: e.clientY, rawX: nextRawX, rawY: nextRawY };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        const room = positioned.find((p) => p.i === roomIndex);
        const others = positioned.filter((p) => p.i !== roomIndex).map((p) => ({ x: p.x, y: p.y, w: p.widthM, h: p.geometry.footprintHeight }));
        const widthM = room?.widthM ?? parseFloat(r.widthM) ?? 0;
        const heightM = room?.geometry.footprintHeight ?? parseFloat(r.lengthM) ?? 0;
        const { x, y } = snapPosition(nextRawX, nextRawY, widthM, heightM, others);
        return { ...r, xM: x, yM: y };
      })
    );
  };

  const handlePointerUp = () => {
    dragRef.current = null;
    isDraggingRef.current = false;
  };

  // Resizing a room's own width/length by dragging a handle on its right or bottom edge —
  // rawValue tracks the accumulated size purely from mouse movement, kept separate from the
  // clamped displayed value for the same reason room dragging keeps rawX/rawY separate from
  // the snapped position: clamping the displayed value would otherwise corrupt the next
  // delta's starting point, causing the size to drift out of sync with the pointer.
  const resizeDragRef = useRef<{ roomIndex: number; axis: "width" | "length"; lastClientX: number; lastClientY: number; rawValue: number; rotationDeg: number } | null>(null);

  const handleResizePointerDown = (e: React.PointerEvent, roomIndex: number, axis: "width" | "length", currentValue: number, rotationDeg: number) => {
    e.stopPropagation(); // otherwise the room's own drag handler on the parent <g> fires too
    resizeDragRef.current = { roomIndex, axis, lastClientX: e.clientX, lastClientY: e.clientY, rawValue: currentValue, rotationDeg };
    (e.target as Element).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragHasCommittedRef.current = false;
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    if (!resizeDragRef.current) return;
    e.stopPropagation();
    const { roomIndex, axis, lastClientX, lastClientY, rawValue, rotationDeg } = resizeDragRef.current;
    // The raw mouse delta is in screen space, where "horizontal" and "vertical" always mean
    // the same fixed directions regardless of the room's own rotation - but width/length live
    // in the room's own, rotated local space. Rotating the delta vector by the room's own
    // angle (around the origin, since a delta is a direction/magnitude, not a positioned
    // point) translates it into that local space before it's applied, so the "width" handle
    // genuinely tracks the room's own width edge, not just whatever's horizontal on screen.
    const rawDeltaXm = (e.clientX - lastClientX) / PIXELS_PER_METRE;
    const rawDeltaYm = (e.clientY - lastClientY) / PIXELS_PER_METRE;
    const [localDeltaX, localDeltaY] = rotationDeg ? rotatePoint(rawDeltaXm, rawDeltaYm, 0, 0, -rotationDeg) : [rawDeltaXm, rawDeltaYm];
    const deltaM = axis === "width" ? localDeltaX : localDeltaY;
    const nextRawValue = rawValue + deltaM;
    resizeDragRef.current = { roomIndex, axis, lastClientX: e.clientX, lastClientY: e.clientY, rawValue: nextRawValue, rotationDeg };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        const { minWidth, minLength } = minRoomSize({
          shape: r.shape,
          bayWidthM: r.bayWidthM ? parseFloat(r.bayWidthM) : undefined,
          bayDepthM: r.bayDepthM ? parseFloat(r.bayDepthM) : undefined,
          hasBayWindow: r.hasBayWindow,
          notchWidthM: r.notchWidthM ? parseFloat(r.notchWidthM) : undefined,
          notchDepthM: r.notchDepthM ? parseFloat(r.notchDepthM) : undefined,
          angledCutWidthM: r.angledCutWidthM ? parseFloat(r.angledCutWidthM) : undefined,
          angledCutDepthM: r.angledCutDepthM ? parseFloat(r.angledCutDepthM) : undefined,
          trapezoidTopWidthM: r.trapezoidTopWidthM ? parseFloat(r.trapezoidTopWidthM) : undefined,
          slopedTopAmountM: r.slopedTopAmountM ? parseFloat(r.slopedTopAmountM) : undefined,
        });
        const MAX_SIZE = 30; // matches the same upper bound already enforced server-side
        if (axis === "width") {
          const clamped = Math.max(minWidth, Math.min(MAX_SIZE, nextRawValue));
          return { ...r, widthM: clamped.toFixed(2) };
        }
        const clamped = Math.max(minLength, Math.min(MAX_SIZE, nextRawValue));
        return { ...r, lengthM: clamped.toFixed(2) };
      })
    );
  };

  const handleResizePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    resizeDragRef.current = null;
    isDraggingRef.current = false;
  };

  // Separate from the room drag above — a fixture drag needs to know which room AND which
  // fixture type, and moves the fixture within the room's own local coordinate space rather
  // than the floor's overall layout space.
  const fixtureDragRef = useRef<{ roomIndex: number; fixtureType: string; lastClientX: number; lastClientY: number } | null>(null);

  const handleFixturePointerDown = (e: React.PointerEvent, roomIndex: number, fixtureType: string) => {
    e.stopPropagation(); // otherwise the room's own drag handler on the parent <g> fires too
    fixtureDragRef.current = { roomIndex, fixtureType, lastClientX: e.clientX, lastClientY: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragHasCommittedRef.current = false;
  };

  const handleFixturePointerMove = (e: React.PointerEvent, currentFixtures: { type: string; x: number; y: number }[]) => {
    if (!fixtureDragRef.current) return;
    e.stopPropagation();
    const { roomIndex, fixtureType, lastClientX, lastClientY } = fixtureDragRef.current;
    const rawDeltaXm = (e.clientX - lastClientX) / PIXELS_PER_METRE;
    const rawDeltaYm = (e.clientY - lastClientY) / PIXELS_PER_METRE;
    fixtureDragRef.current = { roomIndex, fixtureType, lastClientX: e.clientX, lastClientY: e.clientY };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        // Same reasoning as the resize handles' rotation fix: the raw mouse delta is in
        // screen space, but a fixture's x/y live in the room's own, potentially-rotated
        // local space (it's rendered inside the same rotated <g> as everything else in the
        // room). Rotating the delta by the room's own angle before applying it keeps the
        // fixture actually following the mouse, rather than drifting off in some other
        // direction whenever the room isn't sitting at its default, unrotated orientation.
        const rotationDeg = r.rotationDeg ? parseFloat(r.rotationDeg) : 0;
        const [deltaXm, deltaYm] = rotationDeg ? rotatePoint(rawDeltaXm, rawDeltaYm, 0, 0, -rotationDeg) : [rawDeltaXm, rawDeltaYm];
        const existing = r.fixturePositions?.find((f) => f.type === fixtureType);
        // Falls back to the fixture's current rendered position (from the auto-layout) if
        // it's never been manually moved before — otherwise the very first drag movement
        // would jump the fixture from wherever it's actually drawn to an unrelated spot.
        const currentRendered = currentFixtures.find((f) => f.type === fixtureType);
        const currentX = existing?.xM ?? currentRendered?.x ?? 0;
        const currentY = existing?.yM ?? currentRendered?.y ?? 0;
        const nextX = currentX + deltaXm;
        const nextY = currentY + deltaYm;
        const others = (r.fixturePositions || []).filter((f) => f.type !== fixtureType);
        return { ...r, fixturePositions: [...others, { type: fixtureType, xM: nextX, yM: nextY }] };
      })
    );
  };

  const handleFixturePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    fixtureDragRef.current = null;
    isDraggingRef.current = false;
  };

  // An exterior door can only slide along the wall it's already assigned to — top/bottom
  // walls move along the room's width (x), left/right walls move along its length (y) — so
  // only the relevant axis delta gets applied, unlike fixtures which move freely in 2D.
  const exteriorDoorDragRef = useRef<{ roomIndex: number; doorIndex: number; lastClientX: number; lastClientY: number } | null>(null);

  const handleExteriorDoorPointerDown = (e: React.PointerEvent, roomIndex: number, doorIndex: number) => {
    e.stopPropagation();
    exteriorDoorDragRef.current = { roomIndex, doorIndex, lastClientX: e.clientX, lastClientY: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragHasCommittedRef.current = false;
  };

  const handleExteriorDoorPointerMove = (e: React.PointerEvent) => {
    if (!exteriorDoorDragRef.current) return;
    e.stopPropagation();
    const { roomIndex, doorIndex, lastClientX, lastClientY } = exteriorDoorDragRef.current;
    const rawDeltaXm = (e.clientX - lastClientX) / PIXELS_PER_METRE;
    const rawDeltaYm = (e.clientY - lastClientY) / PIXELS_PER_METRE;
    exteriorDoorDragRef.current = { roomIndex, doorIndex, lastClientX: e.clientX, lastClientY: e.clientY };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        const doors = r.exteriorDoors || [];
        const existing = doors[doorIndex];
        if (!existing) return r;
        const rotationDeg = r.rotationDeg ? parseFloat(r.rotationDeg) : 0;
        const [deltaXm, deltaYm] = rotationDeg ? rotatePoint(rawDeltaXm, rawDeltaYm, 0, 0, -rotationDeg) : [rawDeltaXm, rawDeltaYm];
        const wall = existing.wall;
        const span = wall === "top" || wall === "bottom" ? parseFloat(r.widthM) || 0 : parseFloat(r.lengthM) || 0;
        const axisDelta = wall === "top" || wall === "bottom" ? deltaXm : deltaYm;
        const nextPosition = Math.max(0, Math.min(span, existing.positionM + axisDelta));
        const nextDoors = doors.map((d, di) => (di === doorIndex ? { ...d, positionM: nextPosition } : d));
        return { ...r, exteriorDoors: nextDoors };
      })
    );
  };

  const handleExteriorDoorPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    exteriorDoorDragRef.current = null;
    isDraggingRef.current = false;
  };

  // Windows are keyed by array index rather than a type like "main"/"rear", since a room
  // can have any number of windows on the same wall with no natural way to distinguish them.
  const windowDragRef = useRef<{ roomIndex: number; windowIndex: number; lastClientX: number; lastClientY: number } | null>(null);

  const handleWindowPointerDown = (e: React.PointerEvent, roomIndex: number, windowIndex: number) => {
    e.stopPropagation();
    windowDragRef.current = { roomIndex, windowIndex, lastClientX: e.clientX, lastClientY: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragHasCommittedRef.current = false;
  };

  const handleWindowPointerMove = (e: React.PointerEvent) => {
    if (!windowDragRef.current) return;
    e.stopPropagation();
    const { roomIndex, windowIndex, lastClientX, lastClientY } = windowDragRef.current;
    const rawDeltaXm = (e.clientX - lastClientX) / PIXELS_PER_METRE;
    const rawDeltaYm = (e.clientY - lastClientY) / PIXELS_PER_METRE;
    windowDragRef.current = { roomIndex, windowIndex, lastClientX: e.clientX, lastClientY: e.clientY };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        const wins = r.windows || [];
        const existing = wins[windowIndex];
        if (!existing) return r;
        const rotationDeg = r.rotationDeg ? parseFloat(r.rotationDeg) : 0;
        const [deltaXm, deltaYm] = rotationDeg ? rotatePoint(rawDeltaXm, rawDeltaYm, 0, 0, -rotationDeg) : [rawDeltaXm, rawDeltaYm];
        const wall = existing.wall;
        const span = wall === "top" || wall === "bottom" ? parseFloat(r.widthM) || 0 : parseFloat(r.lengthM) || 0;
        const axisDelta = wall === "top" || wall === "bottom" ? deltaXm : deltaYm;
        const nextPosition = Math.max(0, Math.min(span, existing.positionM + axisDelta));
        const nextWins = wins.map((w, wi) => (wi === windowIndex ? { ...w, positionM: nextPosition } : w));
        return { ...r, windows: nextWins };
      })
    );
  };

  const handleWindowPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    windowDragRef.current = null;
    isDraggingRef.current = false;
  };

  const [exporting, setExporting] = useState(false);
  // Off by default — resize handles only appear (and only respond to drag) once explicitly
  // toggled on, rather than always sitting on every room where they'd clutter the view and
  // risk an accidental resize while trying to just reposition a room instead.
  const [resizeMode, setResizeMode] = useState(false);

  const handleExportImage = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    setExporting(true);

    try {
      const serialized = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const widthPx = parseFloat(svgEl.getAttribute("width") || "0");
      const heightPx = parseFloat(svgEl.getAttribute("height") || "0");
      // Scaled up well beyond the SVG's native pixel size — at PIXELS_PER_METRE's native
      // resolution a typical floor would export quite small and look soft when viewed full
      // size or attached to a listing.
      const EXPORT_SCALE = 3;
      const FOOTER_HEIGHT = 130;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = widthPx * EXPORT_SCALE;
        canvas.height = heightPx * EXPORT_SCALE + FOOTER_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setExporting(false);
          URL.revokeObjectURL(url);
          return;
        }
        // PNG supports transparency and the SVG itself has no background rect — without
        // this the exported image would have a transparent background, which looks wrong
        // when viewed or printed against anything other than plain white.
        ctx.fillStyle = "#FBF8F4";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height - FOOTER_HEIGHT);
        URL.revokeObjectURL(url);

        // App name, bold and prominent
        ctx.fillStyle = "#25344A";
        ctx.font = "bold 26px Arial, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("ProptMate", 20, canvas.height - FOOTER_HEIGHT + 32);

        // Area total, right-aligned on the same row — matches the professional convention
        // of showing the floor's area directly on the image, not just in the app UI.
        if (totalAreaM2 > 0) {
          ctx.font = "600 15px Arial, sans-serif";
          ctx.fillStyle = "#6B6A63";
          ctx.textAlign = "right";
          ctx.fillText(formatAreaBoth(totalAreaM2), canvas.width - 20, canvas.height - FOOTER_HEIGHT + 32);
          ctx.textAlign = "left";
        }

        // Disclaimer, wrapped manually since canvas fillText doesn't wrap on its own
        const disclaimer =
          "This plan is for illustrative purposes only. Measurements of doors, windows, rooms and any other items are approximate — no responsibility is taken for any error, omission, or misstatement.";
        ctx.font = "15px Arial, sans-serif";
        ctx.fillStyle = "#6B6A63";
        const maxLineWidth = canvas.width - 40;
        const words = disclaimer.split(" ");
        let line = "";
        let lineY = canvas.height - FOOTER_HEIGHT + 62;
        const lineHeight = 20;
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(testLine).width > maxLineWidth && line) {
            ctx.fillText(line, 20, lineY);
            line = word;
            lineY += lineHeight;
          } else {
            line = testLine;
          }
        }
        if (line) ctx.fillText(line, 20, lineY);

        canvas.toBlob((pngBlob) => {
          setExporting(false);
          if (!pngBlob) return;
          const pngUrl = URL.createObjectURL(pngBlob);
          const a = document.createElement("a");
          a.href = pngUrl;
          a.download = `floor-plan-${(levels[activeLevel]?.name || "floor").toLowerCase().replace(/\s+/g, "-")}.png`;
          a.click();
          URL.revokeObjectURL(pngUrl);
        }, "image/png");
      };
      img.onerror = () => {
        setExporting(false);
        URL.revokeObjectURL(url);
        setError("Couldn't export this floor plan as an image — please try again.");
      };
      img.src = url;
    } catch {
      setExporting(false);
      setError("Couldn't export this floor plan as an image — please try again.");
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = levels.map((lvl) => ({
        name: lvl.name,
        rooms: lvl.rooms
          .map((r) => {
            const widthM = parseFloat(r.widthM);
            const lengthM = parseFloat(r.lengthM);
            let shapeParams: string | undefined;
            if (r.shape === "bay-window" && r.bayWidthM && r.bayDepthM) {
              shapeParams = JSON.stringify({ bayWidthM: parseFloat(r.bayWidthM), bayDepthM: parseFloat(r.bayDepthM) });
            } else if (r.shape === "l-shape" && r.notchWidthM && r.notchDepthM) {
              shapeParams = JSON.stringify({ notchWidthM: parseFloat(r.notchWidthM), notchDepthM: parseFloat(r.notchDepthM), notchCorner: r.notchCorner || "bottom-right" });
            } else if (r.shape === "angled-corner" && r.angledCutWidthM && r.angledCutDepthM) {
              shapeParams = JSON.stringify({
                angledCutWidthM: parseFloat(r.angledCutWidthM),
                angledCutDepthM: parseFloat(r.angledCutDepthM),
                angledCorner: r.angledCorner || "bottom-right",
              });
            } else if (r.shape === "trapezoid" && r.trapezoidTopWidthM) {
              shapeParams = JSON.stringify({
                trapezoidTopWidthM: parseFloat(r.trapezoidTopWidthM),
                trapezoidSide: r.trapezoidSide || "both",
              });
            } else if (r.shape === "sloped-top" && r.slopedTopAmountM) {
              shapeParams = JSON.stringify({
                slopedTopAmountM: parseFloat(r.slopedTopAmountM),
                slopedTopSide: r.slopedTopSide || "left",
              });
            }
            return {
              name: r.name.trim(),
              widthM,
              lengthM,
              xM: r.xM,
              yM: r.yM,
              shape: r.shape,
              shapeParams,
              hasBayWindow: r.shape !== "bay-window" && !!r.hasBayWindow,
              bayWindowWidthM: r.shape !== "bay-window" && r.hasBayWindow && r.bayWidthM ? parseFloat(r.bayWidthM) : undefined,
              bayWindowDepthM: r.shape !== "bay-window" && r.hasBayWindow && r.bayDepthM ? parseFloat(r.bayDepthM) : undefined,
              rotationDeg: r.rotationDeg ? parseFloat(r.rotationDeg) : undefined,
              connectedRoomNames: r.connectedTo,
              flippedSwingConnections: r.flippedSwingConnections,
              flippedHingeConnections: r.flippedHingeConnections,
              isStairs: r.isStairs,
              stairDirection: r.stairDirection,
              stairLinkFloor: r.stairLinkFloor,
              stairLinkRoom: r.stairLinkRoom,
              fixturePositions: r.fixturePositions,
              enabledFixtures: r.enabledFixtures,
              isGarden: r.isGarden,
              exteriorDoors: r.exteriorDoors,
              windows: r.windows,
              manualRoomTypes: r.manualRoomTypes,
            };
          })
          .filter((r) => r.name && r.widthM > 0 && r.widthM <= 30 && r.lengthM > 0 && r.lengthM <= 30),
      }));
      await saveFloorPlan(propertyId, payload);
      setSaved(true);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mt-6 flex-wrap">
        {levels.map((lvl, i) => (
          <div key={i} className={`flex items-center gap-1 rounded-full pl-3 pr-1 py-1 text-sm ${i === activeLevel ? "bg-signal text-white" : "bg-white border border-line text-ink"}`}>
            <button
              onClick={() => {
                setActiveLevel(i);
                setAiDimensionsEstimated(false);
                setAiError("");
              }}
              disabled={aiGenerating}
              title={aiGenerating ? "Switching floors is disabled while a sketch is being read" : undefined}
              className="font-medium disabled:cursor-not-allowed disabled:opacity-60"
            >
              {lvl.name}
            </button>
            {levels.length > 1 && (
              <button
                onClick={() => removeLevel(i)}
                disabled={aiGenerating}
                title={aiGenerating ? "Disabled while a sketch is being read" : undefined}
                className={`w-5 h-5 rounded-full flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-60 ${
                  i === activeLevel ? "hover:bg-white/20" : "hover:bg-paper"
                }`}
                aria-label={`Remove ${lvl.name}`}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button onClick={addLevel} disabled={aiGenerating} className="text-sm text-ink border border-line rounded-full px-3 py-1.5 hover:border-signal transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
          + Add floor
        </button>
        <button
          onClick={duplicateLevel}
          disabled={aiGenerating}
          className="text-sm text-ink border border-line rounded-full px-3 py-1.5 hover:border-signal transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          ⧉ Duplicate this floor
        </button>
        <button
          onClick={undo}
          disabled={historyRef.current.past.length === 0}
          title="Undo (Ctrl+Z)"
          className="text-sm text-ink border border-line rounded-full px-3 py-1.5 hover:border-signal transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line"
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={historyRef.current.future.length === 0}
          title="Redo (Ctrl+Shift+Z)"
          className="text-sm text-ink border border-line rounded-full px-3 py-1.5 hover:border-signal transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-line"
        >
          ↷ Redo
        </button>
        <label
          className={`text-sm rounded-full px-3 py-1.5 transition-colors cursor-pointer ${
            aiGenerating ? "bg-slate/20 text-slate cursor-not-allowed" : "border border-signal text-signal hover:bg-signal/10"
          }`}
        >
          {aiGenerating
            ? aiUploadProgress
              ? `Reading sketch ${aiUploadProgress.current} of ${aiUploadProgress.total}…`
              : "Reading sketch…"
            : "✨ Upload hand-drawn sketch(es)"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={aiGenerating}
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) handleAiUpload(files);
              e.target.value = ""; // allows re-uploading the same file(s) again if needed
            }}
          />
        </label>
      </div>

      {rooms.length === 0 && levels.length === 1 && (
        <p className="text-xs text-slate mt-1">
          Selecting more than one sketch: the first becomes this floor, and each one after it creates its own new floor — handy for a multi-storey
          property where you have a separate sketch per level.
        </p>
      )}

      {propertyTotalAreaM2 > 0 && (
        <p className="text-xs text-slate mt-2">
          Whole property: <span className="font-medium text-ink">{formatAreaBoth(propertyTotalAreaM2)}</span> across {floorsWithValidData} floor{floorsWithValidData === 1 ? "" : "s"}
        </p>
      )}

      {aiError && <p className="text-sm text-red-600 mt-2 whitespace-pre-wrap">{aiError}</p>}
      {aiDimensionsEstimated && !aiError && (
        <p className="text-sm text-signal mt-2">
          The sketch didn't have measurements written on it, so room sizes below are typical estimates, not extracted from the drawing — please check and correct each one.
        </p>
      )}

      <div className="mt-3">
        <label className="text-xs text-slate">Floor name</label>
        <input
          type="text"
          value={levels[activeLevel]?.name ?? ""}
          onChange={(e) => renameLevel(activeLevel, e.target.value)}
          className="mt-1 block w-full max-w-xs border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-4">
        <div className="bg-white border border-line rounded-xl p-6">
          <h2 className="font-display font-600 text-ink mb-1">Rooms on this floor</h2>
          <p className="text-sm text-slate mb-4">Enter each room's name, dimensions, and shape — the layout on the right updates automatically, and you can drag rooms there to rearrange them.</p>

          <div className="space-y-4">
            {rooms.map((room, i) => (
              <div key={i} className="border border-line rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Room name"
                    value={room.name}
                    onChange={(e) => updateRoom(i, { name: e.target.value })}
                    className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="30"
                    placeholder="Width (m)"
                    value={room.widthM}
                    onChange={(e) => updateRoom(i, { widthM: e.target.value })}
                    className="w-24 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <span className="text-slate">×</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="30"
                    placeholder="Length (m)"
                    value={room.lengthM}
                    onChange={(e) => updateRoom(i, { lengthM: e.target.value })}
                    className="w-24 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <button onClick={() => copyRoom(i)} className="text-slate hover:text-ink shrink-0 px-1" aria-label="Copy room" title="Copy this room">
                    ⧉
                  </button>
                  <button onClick={() => removeRoom(i)} className="text-slate hover:text-red-600 shrink-0 px-1" aria-label="Remove room">
                    ×
                  </button>
                </div>

                <div className="flex items-center flex-wrap gap-2 mt-2">
                  <label className="text-xs text-slate shrink-0">Shape</label>
                  <select
                    value={room.shape}
                    onChange={(e) => {
                      const newShape = e.target.value as Room["shape"];
                      const clearHasBayWindow = newShape === "bay-window" ? { hasBayWindow: false } : {};
                      updateRoom(
                        i,
                        newShape === "rectangle"
                          ? { shape: newShape, ...clearHasBayWindow }
                          : { shape: newShape, isStairs: false, stairDirection: undefined, stairLinkFloor: undefined, stairLinkRoom: undefined, ...clearHasBayWindow }
                      );
                    }}
                    className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                  >
                    <option value="rectangle">Rectangle</option>
                    <option value="bay-window">Bay window</option>
                    <option value="l-shape">L-shaped</option>
                    <option value="angled-corner">Angled corner</option>
                    <option value="trapezoid">Trapezoid (angled side wall)</option>
                    <option value="sloped-top">Sloped top wall</option>
                  </select>

                  <label className="text-xs text-slate shrink-0" title="Rotate this room to any angle - useful for a wall that runs at an angle to the rest of the property">
                    Rotate
                  </label>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    max="359"
                    placeholder="0°"
                    value={room.rotationDeg ?? ""}
                    onChange={(e) => updateRoom(i, { rotationDeg: e.target.value })}
                    className="w-16 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <span className="text-xs text-slate">°</span>

                  {room.shape !== "bay-window" && (
                    <>
                      <label className="flex items-center gap-1.5 text-xs text-slate shrink-0" title="Adds a bay window on top of whatever shape is selected above - for a room that has both, like an L-shaped room with a bay window on one of its straight walls">
                        <input
                          type="checkbox"
                          checked={!!room.hasBayWindow}
                          onChange={(e) => updateRoom(i, { hasBayWindow: e.target.checked })}
                          className="rounded border-line"
                        />
                        + Bay window
                      </label>
                      {room.hasBayWindow && (
                        <>
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="Bay width (m)"
                            value={room.bayWidthM ?? ""}
                            onChange={(e) => updateRoom(i, { bayWidthM: e.target.value })}
                            className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                          />
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            placeholder="Bay depth (m)"
                            value={room.bayDepthM ?? ""}
                            onChange={(e) => updateRoom(i, { bayDepthM: e.target.value })}
                            className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                          />
                        </>
                      )}
                    </>
                  )}

                  {room.shape === "bay-window" && (
                    <>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Bay width (m)"
                        value={room.bayWidthM ?? ""}
                        onChange={(e) => updateRoom(i, { bayWidthM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Bay depth (m)"
                        value={room.bayDepthM ?? ""}
                        onChange={(e) => updateRoom(i, { bayDepthM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                    </>
                  )}

                  {room.shape === "l-shape" && (
                    <>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Notch width (m)"
                        value={room.notchWidthM ?? ""}
                        onChange={(e) => updateRoom(i, { notchWidthM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Notch depth (m)"
                        value={room.notchDepthM ?? ""}
                        onChange={(e) => updateRoom(i, { notchDepthM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      <select
                        value={room.notchCorner || "bottom-right"}
                        onChange={(e) => updateRoom(i, { notchCorner: e.target.value as "top-left" | "top-right" | "bottom-left" | "bottom-right" })}
                        className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      >
                        <option value="top-left">Notch: top-left</option>
                        <option value="top-right">Notch: top-right</option>
                        <option value="bottom-left">Notch: bottom-left</option>
                        <option value="bottom-right">Notch: bottom-right</option>
                      </select>
                    </>
                  )}

                  {room.shape === "angled-corner" && (
                    <>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Cut width (m)"
                        value={room.angledCutWidthM ?? ""}
                        onChange={(e) => updateRoom(i, { angledCutWidthM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Cut depth (m)"
                        value={room.angledCutDepthM ?? ""}
                        onChange={(e) => updateRoom(i, { angledCutDepthM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      <select
                        value={room.angledCorner || "bottom-right"}
                        onChange={(e) => updateRoom(i, { angledCorner: e.target.value as "top-left" | "top-right" | "bottom-left" | "bottom-right" })}
                        className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      >
                        <option value="top-left">Angled: top-left</option>
                        <option value="top-right">Angled: top-right</option>
                        <option value="bottom-left">Angled: bottom-left</option>
                        <option value="bottom-right">Angled: bottom-right</option>
                      </select>
                    </>
                  )}

                  {room.shape === "trapezoid" && (
                    <>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Top width (m)"
                        value={room.trapezoidTopWidthM ?? ""}
                        onChange={(e) => updateRoom(i, { trapezoidTopWidthM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      <select
                        value={room.trapezoidSide || "both"}
                        onChange={(e) => updateRoom(i, { trapezoidSide: e.target.value as "left" | "right" | "both" })}
                        className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      >
                        <option value="left">Left wall angled</option>
                        <option value="right">Right wall angled</option>
                        <option value="both">Both walls angled</option>
                      </select>
                    </>
                  )}

                  {room.shape === "sloped-top" && (
                    <>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Slope amount (m)"
                        value={room.slopedTopAmountM ?? ""}
                        onChange={(e) => updateRoom(i, { slopedTopAmountM: e.target.value })}
                        className="w-28 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      />
                      <select
                        value={room.slopedTopSide || "left"}
                        onChange={(e) => updateRoom(i, { slopedTopSide: e.target.value as "left" | "right" })}
                        className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                      >
                        <option value="left">Top wall lower on left</option>
                        <option value="right">Top wall lower on right</option>
                      </select>
                    </>
                  )}
                </div>

                {room.shape === "rectangle" && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={!!room.isStairs}
                          onChange={(e) =>
                            updateRoom(
                              i,
                              e.target.checked
                                ? { isStairs: true, isGarden: false }
                                : { isStairs: false, stairDirection: undefined, stairLinkFloor: undefined, stairLinkRoom: undefined }
                            )
                          }
                        />
                        This is a staircase
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-ink">
                        <input
                          type="checkbox"
                          checked={!!room.isGarden}
                          onChange={(e) =>
                            updateRoom(
                              i,
                              e.target.checked
                                ? { isGarden: true, isStairs: false, stairDirection: undefined, stairLinkFloor: undefined, stairLinkRoom: undefined }
                                : { isGarden: false }
                            )
                          }
                        />
                        This is a garden/outdoor area
                      </label>
                      {room.isStairs && (
                        <select
                          value={room.stairDirection ?? "up"}
                          onChange={(e) => updateRoom(i, { stairDirection: e.target.value as "up" | "down" })}
                          className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                        >
                          <option value="up">Leads up</option>
                          <option value="down">Leads down</option>
                        </select>
                      )}
                    </div>

                    {room.isStairs && levels.length > 1 && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <label className="text-xs text-slate shrink-0">Continues on:</label>
                        <select
                          value={room.stairLinkFloor ?? ""}
                          onChange={(e) => updateRoom(i, { stairLinkFloor: e.target.value || undefined, stairLinkRoom: undefined })}
                          className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                        >
                          <option value="">Not linked</option>
                          {levels
                            .map((lvl, li) => ({ lvl, li }))
                            .filter(({ li }) => li !== activeLevel)
                            .map(({ lvl, li }) => (
                              <option key={li} value={lvl.name}>
                                {lvl.name}
                              </option>
                            ))}
                        </select>
                        {room.stairLinkFloor &&
                          (() => {
                            const targetLevel = levels.find((lvl) => lvl.name === room.stairLinkFloor);
                            const targetStairs = (targetLevel?.rooms ?? []).filter((r) => r.isStairs && r.name.trim());
                            return (
                              <select
                                value={room.stairLinkRoom ?? ""}
                                onChange={(e) => updateRoom(i, { stairLinkRoom: e.target.value || undefined })}
                                className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                              >
                                <option value="">Which staircase?</option>
                                {targetStairs.map((r, ri) => (
                                  <option key={ri} value={r.name.trim()}>
                                    {r.name.trim()}
                                  </option>
                                ))}
                              </select>
                            );
                          })()}
                      </div>
                    )}
                  </div>
                )}

                {!room.isGarden && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-slate">Exterior doors:</p>
                    {(room.exteriorDoors || []).map((door, di) => {
                      const label = door.label || (door.type === "main" ? "Main entrance" : door.type === "rear" ? "Rear garden door" : "");
                      return (
                        <div key={di} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={label}
                            onChange={(e) => {
                              const next = (room.exteriorDoors || []).map((d, i2) => (i2 === di ? { ...d, label: e.target.value, type: undefined } : d));
                              updateRoom(i, { exteriorDoors: next });
                            }}
                            placeholder="e.g. Main entrance"
                            className="border border-line rounded-lg px-2 py-1 text-xs w-32 focus:outline-none focus:ring-2 focus:ring-signal"
                          />
                          <select
                            value={door.wall}
                            onChange={(e) => {
                              const wall = e.target.value as "top" | "bottom" | "left" | "right";
                              const widthNum = parseFloat(room.widthM) || 3;
                              const lengthNum = parseFloat(room.lengthM) || 3;
                              // Re-centers along the new wall's own length when switching
                              // sides — a position measured along one wall doesn't carry any
                              // sensible meaning on a wall running the other way.
                              const span = wall === "top" || wall === "bottom" ? widthNum : lengthNum;
                              const next = (room.exteriorDoors || []).map((d, i2) => (i2 === di ? { ...d, wall, positionM: span / 2 } : d));
                              updateRoom(i, { exteriorDoors: next });
                            }}
                            className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                          >
                            <option value="top">Top wall</option>
                            <option value="bottom">Bottom wall</option>
                            <option value="left">Left wall</option>
                            <option value="right">Right wall</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => {
                              const next = (room.exteriorDoors || []).map((d, i2) => (i2 === di ? { ...d, swingFlipped: !d.swingFlipped } : d));
                              updateRoom(i, { exteriorDoors: next });
                            }}
                            title="Click to change which way this door swings"
                            className={`text-xs px-1.5 py-0.5 rounded border ${door.swingFlipped ? "border-signal text-signal" : "border-line text-slate hover:text-ink"}`}
                          >
                            ⟲ {door.swingFlipped ? "Swings out" : "Swings in"}
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRoom(i, { exteriorDoors: (room.exteriorDoors || []).filter((_, i2) => i2 !== di) })}
                            className="text-slate hover:text-red-600 text-xs px-1"
                            aria-label="Remove door"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                    {(room.exteriorDoors || []).length < 10 && (
                      <button
                        type="button"
                        onClick={() => {
                          const widthNum = parseFloat(room.widthM) || 3;
                          updateRoom(i, { exteriorDoors: [...(room.exteriorDoors || []), { label: "", wall: "top" as const, positionM: widthNum / 2 }] });
                        }}
                        className="text-xs text-slate hover:text-ink underline"
                      >
                        + Add door
                      </button>
                    )}
                  </div>
                )}

                {!room.isGarden && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-slate">Windows:</p>
                    {(room.windows || []).map((win, wi) => (
                      <div key={wi} className="flex items-center gap-2">
                        <select
                          value={win.wall}
                          onChange={(e) => {
                            const wall = e.target.value as "top" | "bottom" | "left" | "right";
                            const widthNum = parseFloat(room.widthM) || 3;
                            const lengthNum = parseFloat(room.lengthM) || 3;
                            // Re-centers along the new wall's own length when switching
                            // sides, same reasoning as exterior doors — a position measured
                            // along one wall doesn't carry any sensible meaning on a wall
                            // running the other way.
                            const span = wall === "top" || wall === "bottom" ? widthNum : lengthNum;
                            const next = (room.windows || []).map((w, i2) => (i2 === wi ? { wall, positionM: span / 2 } : w));
                            updateRoom(i, { windows: next });
                          }}
                          className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                        >
                          <option value="top">Top wall</option>
                          <option value="bottom">Bottom wall</option>
                          <option value="left">Left wall</option>
                          <option value="right">Right wall</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => updateRoom(i, { windows: (room.windows || []).filter((_, i2) => i2 !== wi) })}
                          className="text-slate hover:text-red-600 text-xs px-1"
                          aria-label="Remove window"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {(room.windows || []).length < 20 && (
                      <button
                        type="button"
                        onClick={() => {
                          const widthNum = parseFloat(room.widthM) || 3;
                          updateRoom(i, { windows: [...(room.windows || []), { wall: "top" as const, positionM: widthNum / 2 }] });
                        }}
                        className="text-xs text-slate hover:text-ink underline"
                      >
                        + Add window
                      </button>
                    )}
                  </div>
                )}

                {(() => {
                  const detected = detectRoomTypes(room.name);
                  const effectiveTypes = room.manualRoomTypes !== undefined ? room.manualRoomTypes : detected;
                  const ALL_KINDS: ("bathroom" | "kitchen" | "bedroom" | "livingroom")[] = ["bathroom", "kitchen", "bedroom", "livingroom"];
                  const KIND_LABELS: Record<(typeof ALL_KINDS)[number], string> = { bathroom: "Bathroom", kitchen: "Kitchen", bedroom: "Bedroom", livingroom: "Living room" };

                  const typesByKind: Record<(typeof ALL_KINDS)[number], { type: string; label: string }[]> = {
                    bathroom: [
                      { type: "bath", label: "Bath" },
                      { type: "shower", label: "Shower" },
                      { type: "toilet", label: "Toilet" },
                      { type: "basin", label: "Basin" },
                    ],
                    kitchen: [
                      { type: "sink", label: "Sink" },
                      { type: "hob", label: "Hob" },
                    ],
                    bedroom: [
                      { type: "bed", label: "Bed" },
                      { type: "wardrobe", label: "Wardrobe" },
                    ],
                    livingroom: [
                      { type: "sofa", label: "Sofa" },
                      { type: "coffee-table", label: "Coffee table" },
                    ],
                  };
                  const defaultByKind: Record<(typeof ALL_KINDS)[number], string[]> = {
                    bathroom: ["bath", "toilet", "basin"],
                    kitchen: ["sink", "hob"],
                    bedroom: ["bed", "wardrobe"],
                    livingroom: ["sofa", "coffee-table"],
                  };
                  const widthNum = parseFloat(room.widthM);
                  const lengthNum = parseFloat(room.lengthM);
                  // Only used as a fallback starting position when rotating or mirroring a
                  // fixture that's never been manually positioned before — the same "start
                  // from wherever it's currently drawn" approach already used for dragging.
                  // Computed once across every active type together so the fallback position
                  // for a second or third stacked row is correct, not just the first row's.
                  const fallbackLayout = widthNum > 0 && lengthNum > 0 ? allRoomFixtures(effectiveTypes, widthNum, lengthNum, room.fixturePositions, room.enabledFixtures) : [];

                  return (
                    <div className="mt-2 space-y-2">
                      <div>
                        <p className="text-xs text-slate mb-1">Room type (for fixtures) — auto-detected from the name, or set manually:</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          {ALL_KINDS.map((kind) => (
                            <label key={kind} className="flex items-center gap-1 text-xs text-ink">
                              <input
                                type="checkbox"
                                checked={effectiveTypes.includes(kind)}
                                onChange={(e) => {
                                  const base = room.manualRoomTypes !== undefined ? room.manualRoomTypes : detected;
                                  const next = e.target.checked ? [...base, kind] : base.filter((k) => k !== kind);
                                  // A newly-added type needs its own default fixtures merged in
                                  // when enabledFixtures has already been customized for other
                                  // types — otherwise the shared list has no entries for this
                                  // type at all and it would silently show as all-unchecked,
                                  // even though nothing about *this* type was ever touched.
                                  const nextEnabledFixtures =
                                    e.target.checked && room.enabledFixtures !== undefined
                                      ? [...new Set([...room.enabledFixtures, ...defaultByKind[kind]])]
                                      : room.enabledFixtures;
                                  updateRoom(i, { manualRoomTypes: next, enabledFixtures: nextEnabledFixtures });
                                }}
                              />
                              {KIND_LABELS[kind]}
                            </label>
                          ))}
                          {room.manualRoomTypes !== undefined && (
                            <button
                              type="button"
                              onClick={() => {
                                // Reverting to auto-detection can reintroduce a type that was
                                // previously manually removed — needs the same defaults-merge
                                // treatment as adding a type directly, or a reintroduced type's
                                // fixtures would silently show as all-unchecked.
                                const reintroduced = detected.filter((k) => !effectiveTypes.includes(k));
                                const nextEnabledFixtures =
                                  reintroduced.length > 0 && room.enabledFixtures !== undefined
                                    ? [...new Set([...room.enabledFixtures, ...reintroduced.flatMap((k) => defaultByKind[k])])]
                                    : room.enabledFixtures;
                                updateRoom(i, { manualRoomTypes: undefined, enabledFixtures: nextEnabledFixtures });
                              }}
                              className="text-xs text-slate hover:text-ink underline"
                            >
                              Reset to auto-detected
                            </button>
                          )}
                        </div>
                      </div>

                      {effectiveTypes.length > 0 && (
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-xs text-slate">Fixtures shown:</p>
                            {room.fixturePositions && room.fixturePositions.length > 0 && (
                              <button type="button" onClick={() => updateRoom(i, { fixturePositions: undefined })} className="text-xs text-slate hover:text-ink underline">
                                Reset fixture positions
                              </button>
                            )}
                          </div>
                          {effectiveTypes.map((roomKind) => {
                            const allTypes = typesByKind[roomKind];
                            const active = room.enabledFixtures ?? defaultByKind[roomKind];
                            return (
                              <div key={roomKind} className="mb-1">
                                {effectiveTypes.length > 1 && <p className="text-[10px] text-slate/70 mb-0.5">{KIND_LABELS[roomKind]}:</p>}
                                <div className="flex flex-wrap gap-x-3 gap-y-1">
                                  {allTypes.map((t) => {
                                  const existing = room.fixturePositions?.find((p) => p.type === t.type);
                                  const fallback = fallbackLayout.find((p) => p.type === t.type);
                                  const toggleFlag = (flag: "rotated" | "mirrored") => {
                                    const others = (room.fixturePositions || []).filter((p) => p.type !== t.type);
                                    const base = existing ?? { type: t.type, xM: fallback?.x ?? 0.1, yM: fallback?.y ?? 0.1 };
                                    updateRoom(i, { fixturePositions: [...others, { ...base, [flag]: !base[flag] }] });
                                  };
                                  return (
                                    <div key={t.type} className="flex items-center gap-1">
                                      <label className="flex items-center gap-1 text-xs text-ink">
                                        <input
                                          type="checkbox"
                                          checked={active.includes(t.type)}
                                          onChange={(e) => {
                                            const next = e.target.checked ? [...active, t.type] : active.filter((x) => x !== t.type);
                                            const nextPositions = e.target.checked ? room.fixturePositions : (room.fixturePositions || []).filter((p) => p.type !== t.type);
                                            updateRoom(i, { enabledFixtures: next, fixturePositions: nextPositions });
                                          }}
                                        />
                                        {t.label}
                                      </label>
                                      {active.includes(t.type) && (
                                        <>
                                          <button
                                            type="button"
                                            title="Rotate 90°"
                                            onClick={() => toggleFlag("rotated")}
                                            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                              existing?.rotated ? "border-signal text-signal bg-signal/10" : "border-line text-slate"
                                            }`}
                                          >
                                            ⟳
                                          </button>
                                          <button
                                            type="button"
                                            title="Mirror"
                                            onClick={() => toggleFlag("mirrored")}
                                            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                              existing?.mirrored ? "border-signal text-signal bg-signal/10" : "border-line text-slate"
                                            }`}
                                          >
                                            ⇄
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  );
                                })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {rooms.length > 1 && (
                  <div className="mt-2">
                    <p className="text-xs text-slate mb-1">Connects to (door):</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {rooms.map((other, oi) =>
                        oi === i || !other.name.trim() ? null : (
                          <div key={oi} className="flex items-center gap-1 text-xs text-ink">
                            <label className="flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={(room.connectedTo || []).includes(other.name.trim())}
                                onChange={(e) => {
                                  const otherName = other.name.trim();
                                  const current = room.connectedTo || [];
                                  const next = e.target.checked ? [...current, otherName] : current.filter((n) => n !== otherName);
                                  // Unchecking a connection removes any leftover flip
                                  // preferences for it too, so re-checking it later starts
                                  // from the automatic default rather than a stale override.
                                  const nextSwingFlips = e.target.checked ? room.flippedSwingConnections : (room.flippedSwingConnections || []).filter((n) => n !== otherName);
                                  const nextHingeFlips = e.target.checked ? room.flippedHingeConnections : (room.flippedHingeConnections || []).filter((n) => n !== otherName);
                                  updateRoom(i, { connectedTo: next, flippedSwingConnections: nextSwingFlips, flippedHingeConnections: nextHingeFlips });
                                }}
                              />
                              {other.name.trim()}
                            </label>
                            {(room.connectedTo || []).includes(other.name.trim()) && (
                              <>
                                <button
                                  type="button"
                                  title="Flip which room this door swings into"
                                  onClick={() => {
                                    const otherName = other.name.trim();
                                    const current = room.flippedSwingConnections || [];
                                    const next = current.includes(otherName) ? current.filter((n) => n !== otherName) : [...current, otherName];
                                    updateRoom(i, { flippedSwingConnections: next });
                                  }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                    (room.flippedSwingConnections || []).includes(other.name.trim()) ? "border-signal text-signal bg-signal/10" : "border-line text-slate"
                                  }`}
                                >
                                  ⟲ side
                                </button>
                                <button
                                  type="button"
                                  title="Flip which end of the doorway the hinge is on"
                                  onClick={() => {
                                    const otherName = other.name.trim();
                                    const current = room.flippedHingeConnections || [];
                                    const next = current.includes(otherName) ? current.filter((n) => n !== otherName) : [...current, otherName];
                                    updateRoom(i, { flippedHingeConnections: next });
                                  }}
                                  className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                                    (room.flippedHingeConnections || []).includes(other.name.trim()) ? "border-signal text-signal bg-signal/10" : "border-line text-slate"
                                  }`}
                                >
                                  ⟲ hinge
                                </button>
                              </>
                            )}
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button onClick={addRoom} className="text-sm text-ink border border-line rounded-full px-4 py-2 hover:border-signal transition-colors">
              + Add room
            </button>
            {hasManualPositions && (
              <button onClick={resetLayout} className="text-sm text-slate hover:text-ink underline">
                Reset to auto-layout
              </button>
            )}
          </div>

          {hasOutOfRangeRoom && (
            <p className="text-sm text-signal mt-3">A room's dimension looks too large (over 30m) and won't appear in the preview — check for a typo.</p>
          )}
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save floor plan"}
            </button>
            {saved && <span className="text-sm text-verified">✓ Saved</span>}

            {initialLevels.length > 0 && (
              <form action={deleteFloorPlan.bind(null, propertyId)} className="ml-auto">
                <ConfirmSubmitButton confirmMessage="Delete this entire floor plan, including every floor? This cannot be undone." className="text-xs text-red-600 hover:text-red-700 underline">
                  Delete floor plan
                </ConfirmSubmitButton>
              </form>
            )}
          </div>
        </div>

        <div className="bg-white border border-line rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-600 text-ink">Layout preview — {levels[activeLevel]?.name}</h2>
            <div className="flex items-center gap-3">
              {totalAreaM2 > 0 && <span className="text-xs text-slate">{formatAreaBoth(totalAreaM2)} total</span>}
              {positioned.length > 0 && (
                <button
                  onClick={() => setResizeMode((v) => !v)}
                  title="Show drag handles to resize rooms directly on the layout"
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    resizeMode ? "border-signal bg-signal/10 text-signal" : "border-line text-ink hover:border-signal"
                  }`}
                >
                  {resizeMode ? "✓ Resize rooms" : "↔ Resize rooms"}
                </button>
              )}
              {positioned.length > 0 && (
                <button
                  onClick={handleExportImage}
                  disabled={exporting || resizeMode}
                  title={resizeMode ? "Turn off resize mode first, so the handles aren't included in the exported image" : undefined}
                  className="text-xs px-3 py-1.5 rounded-full border border-line text-ink hover:border-signal transition-colors disabled:opacity-50"
                >
                  {exporting ? "Exporting…" : "⬇ Export image"}
                </button>
              )}
            </div>
          </div>

          {positioned.length === 0 ? (
            <p className="text-sm text-slate">Add at least one room to see a preview.</p>
          ) : (
            <div className="overflow-auto border border-line rounded-lg bg-paper">
              <svg
                ref={svgRef}
                width={totalWidth * PIXELS_PER_METRE + 20}
                height={totalHeight * PIXELS_PER_METRE + 20}
                viewBox={`0 0 ${totalWidth * PIXELS_PER_METRE + 20} ${totalHeight * PIXELS_PER_METRE + 20}`}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <defs>
                  <marker id="stairArrowhead" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto">
                    <path d="M0,0 L8,4 L0,8 Z" fill="#25344A" />
                  </marker>
                  <pattern id="gardenHatch" width="10" height="10" patternUnits="userSpaceOnUse">
                    <path d="M0,0 L10,10 M10,0 L0,10" stroke="#8FAE8B" strokeWidth="0.75" />
                  </pattern>
                </defs>
                {/* North compass indicator, positioned in the top-right corner regardless
                    of the floor's own size, matching the standard convention on
                    professional floor plans. */}
                <g transform={`translate(${totalWidth * PIXELS_PER_METRE + 20 - 34}, 26)`}>
                  <line x1={0} y1={22} x2={0} y2={2} stroke="#25344A" strokeWidth="1.5" />
                  <path d="M -4,8 L 0,-2 L 4,8 Z" fill="#25344A" />
                  <text x={0} y={36} fontSize="11" fill="#25344A" textAnchor="middle" fontWeight="600">
                    N
                  </text>
                </g>
                {connectionLines.map((line, li) => (
                  <g key={li}>
                    <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#8B7355" strokeWidth="2" strokeDasharray="6 4" />
                    <circle cx={(line.x1 + line.x2) / 2} cy={(line.y1 + line.y2) / 2} r="4" fill="#8B7355" />
                  </g>
                ))}
                {positioned.map((room) => {
                  const pointsStr = room.geometry.points.map(([px, py]) => `${px * PIXELS_PER_METRE},${py * PIXELS_PER_METRE}`).join(" ");
                  const isOverlapping = overlappingRoomIndices.has(room.i);
                  const roomData = rooms[room.i];
                  const stairs = roomData?.isStairs && roomData.shape === "rectangle" ? stairSteps(room.widthM, room.lengthM) : null;
                  const wPx = room.widthM * PIXELS_PER_METRE;
                  const lPx = room.lengthM * PIXELS_PER_METRE;
                  const stairDir = roomData?.stairDirection ?? "up";
                  const effectiveRoomTypes =
                    !stairs && roomData && !roomData.isGarden
                      ? roomData.manualRoomTypes !== undefined
                        ? roomData.manualRoomTypes
                        : detectRoomTypes(roomData.name)
                      : [];
                  const fixtures = allRoomFixtures(effectiveRoomTypes, room.widthM, room.lengthM, roomData?.fixturePositions, roomData?.enabledFixtures);
                  const exteriorDoorsForRoom = (roomData?.exteriorDoors || []).map((d, di) => ({
                    ...d,
                    index: di,
                    gap: exteriorDoorGap(d.wall, d.positionM, room.widthM, room.lengthM),
                  }));
                  const windowsForRoom = (roomData?.windows || []).map((w, wi) => ({
                    ...w,
                    index: wi,
                    gap: windowGap(w.wall, w.positionM, room.widthM, room.lengthM),
                  }));

                  return (
                    <g
                      key={room.i}
                      transform={`translate(${room.x * PIXELS_PER_METRE + 10}, ${room.y * PIXELS_PER_METRE + 10})${
                        room.rotationDeg
                          ? ` rotate(${room.rotationDeg}, ${(room.widthM * PIXELS_PER_METRE) / 2}, ${(room.lengthM * PIXELS_PER_METRE) / 2})`
                          : ""
                      }`}
                      onPointerDown={(e) => handlePointerDown(e, room)}
                      style={{ cursor: "grab", touchAction: "none" }}
                    >
                      <polygon
                        points={pointsStr}
                        fill={isOverlapping ? "#FEE2E2" : roomData?.isGarden ? "url(#gardenHatch)" : room.color}
                        stroke={isOverlapping ? "#DC2626" : "#25344A"}
                        strokeWidth={isOverlapping ? "2.5" : "1.5"}
                        strokeDasharray={isOverlapping ? "4 2" : undefined}
                      />
                      {resizeMode && (
                        <>
                          <circle
                            cx={room.widthM * PIXELS_PER_METRE}
                            cy={(room.lengthM * PIXELS_PER_METRE) / 2}
                            r={5}
                            fill="#FBF8F4"
                            stroke="#25344A"
                            strokeWidth="1.5"
                            style={{ cursor: "ew-resize", touchAction: "none" }}
                            onPointerDown={(e) => handleResizePointerDown(e, room.i, "width", room.widthM, room.rotationDeg || 0)}
                            onPointerMove={handleResizePointerMove}
                            onPointerUp={handleResizePointerUp}
                          />
                          <circle
                            cx={(room.widthM * PIXELS_PER_METRE) / 2}
                            cy={room.lengthM * PIXELS_PER_METRE}
                            r={5}
                            fill="#FBF8F4"
                            stroke="#25344A"
                            strokeWidth="1.5"
                            style={{ cursor: "ns-resize", touchAction: "none" }}
                            onPointerDown={(e) => handleResizePointerDown(e, room.i, "length", room.lengthM, room.rotationDeg || 0)}
                            onPointerMove={handleResizePointerMove}
                            onPointerUp={handleResizePointerUp}
                          />
                        </>
                      )}
                      {fixtures.map((f, fi) => {
                        const fx = f.x * PIXELS_PER_METRE;
                        const fy = f.y * PIXELS_PER_METRE;
                        const fw = f.w * PIXELS_PER_METRE;
                        const fd = f.d * PIXELS_PER_METRE;
                        let shape: React.ReactNode;
                        if (f.type === "bath") {
                          shape = <rect x={fx} y={fy} width={fw} height={fd} rx={fd * 0.35} fill="none" stroke="#8B7355" strokeWidth="1" />;
                        } else if (f.type === "shower") {
                          shape = (
                            <>
                              <rect x={fx} y={fy} width={fw} height={fd} fill="none" stroke="#8B7355" strokeWidth="1" />
                              <circle cx={fx + fw / 2} cy={fy + fd / 2} r={Math.min(fw, fd) * 0.12} fill="none" stroke="#8B7355" strokeWidth="0.75" />
                              <line x1={fx} y1={fy} x2={fx + fw} y2={fy + fd} stroke="#8B7355" strokeWidth="0.5" />
                            </>
                          );
                        } else if (f.type === "toilet") {
                          shape = (
                            <>
                              <rect x={fx} y={fy} width={fw} height={fd * 0.35} fill="none" stroke="#8B7355" strokeWidth="1" />
                              <ellipse cx={fx + fw / 2} cy={fy + fd * 0.35 + fd * 0.32} rx={fw * 0.38} ry={fd * 0.3} fill="none" stroke="#8B7355" strokeWidth="1" />
                            </>
                          );
                        } else if (f.type === "basin") {
                          shape = <path d={`M ${fx} ${fy} h ${fw} v ${fd * 0.25} a ${fw / 2} ${fd * 0.75} 0 0 1 ${-fw} 0 Z`} fill="none" stroke="#8B7355" strokeWidth="1" />;
                        } else if (f.type === "sink") {
                          shape = (
                            <>
                              <rect x={fx} y={fy} width={fw} height={fd} fill="none" stroke="#8B7355" strokeWidth="1" />
                              <circle cx={fx + fw / 2} cy={fy + fd / 2} r={Math.min(fw, fd) * 0.22} fill="none" stroke="#8B7355" strokeWidth="1" />
                            </>
                          );
                        } else if (f.type === "hob") {
                          shape = (
                            <>
                              <rect x={fx} y={fy} width={fw} height={fd} fill="none" stroke="#8B7355" strokeWidth="1" />
                              {[0.28, 0.72].map((px) =>
                                [0.28, 0.72].map((py) => (
                                  <circle key={`${px}-${py}`} cx={fx + fw * px} cy={fy + fd * py} r={Math.min(fw, fd) * 0.13} fill="none" stroke="#8B7355" strokeWidth="0.75" />
                                ))
                              )}
                            </>
                          );
                        } else if (f.type === "bed") {
                          shape = (
                            <>
                              <rect x={fx} y={fy} width={fw} height={fd} fill="none" stroke="#8B7355" strokeWidth="1" />
                              <rect x={fx + fw * 0.08} y={fy + fd * 0.05} width={fw * 0.84} height={fd * 0.18} fill="none" stroke="#8B7355" strokeWidth="0.75" />
                            </>
                          );
                        } else if (f.type === "wardrobe") {
                          shape = <rect x={fx} y={fy} width={fw} height={fd} fill="none" stroke="#8B7355" strokeWidth="1" />;
                        } else if (f.type === "sofa") {
                          shape = (
                            <>
                              <rect x={fx} y={fy} width={fw} height={fd} fill="none" stroke="#8B7355" strokeWidth="1" />
                              <line x1={fx} y1={fy + fd * 0.3} x2={fx + fw} y2={fy + fd * 0.3} stroke="#8B7355" strokeWidth="0.75" />
                            </>
                          );
                        } else {
                          // coffee-table
                          shape = <rect x={fx} y={fy} width={fw} height={fd} rx={Math.min(fw, fd) * 0.15} fill="none" stroke="#8B7355" strokeWidth="1" />;
                        }
                        return (
                          <g
                            key={fi}
                            transform={f.mirrored ? `translate(${2 * (fx + fw / 2)}, 0) scale(-1, 1)` : undefined}
                            onPointerDown={(e) => handleFixturePointerDown(e, room.i, f.type)}
                            onPointerMove={(e) => handleFixturePointerMove(e, fixtures)}
                            onPointerUp={handleFixturePointerUp}
                            style={{ cursor: "grab", touchAction: "none" }}
                          >
                            {/* Invisible, generously-sized hit area — the fixture outlines
                                themselves are thin strokes with no fill, which would make
                                them very hard to actually grab with a finger otherwise. */}
                            <rect x={fx} y={fy} width={fw} height={fd} fill="transparent" />
                            {shape}
                            {/* A small corner tick, present on every fixture regardless of its
                                own shape — most of the fixture outlines above are otherwise
                                fully left-right symmetric, so mirroring them would look
                                visually identical without something asymmetric to reveal it. */}
                            <line x1={fx} y1={fy} x2={fx + Math.min(fw, fd) * 0.2} y2={fy + Math.min(fw, fd) * 0.2} stroke="#8B7355" strokeWidth="1" />
                          </g>
                        );
                      })}
                      {exteriorDoorsForRoom.map((door) => {
                        const { gap, index } = door;
                        const gapStartPx = gap.start * PIXELS_PER_METRE;
                        const gapEndPx = gap.end * PIXELS_PER_METRE;
                        const doorWidthPx = gapEndPx - gapStartPx;
                        const wallPx = gap.fixed * PIXELS_PER_METRE;
                        const flipped = !!door.swingFlipped;

                        // Hinge always at the gap's start side. The un-flipped (inward)
                        // direction is verified per-wall with actual arc geometry; flipping
                        // mirrors the open end across the hinge and inverts the sweep flag —
                        // confirmed correct for all 4 walls by direct geometric computation
                        // before implementing, since a single assumed sweep value is wrong
                        // for some cases and would bulge the arc into the wrong side.
                        let hinge: [number, number], openEnd: [number, number], labelX: number, labelY: number;
                        if (door.wall === "top") {
                          hinge = [gapStartPx, wallPx];
                          openEnd = flipped ? [gapStartPx, wallPx - doorWidthPx] : [gapStartPx, wallPx + doorWidthPx];
                          labelX = gapStartPx;
                          labelY = flipped ? wallPx - doorWidthPx - 6 : wallPx + doorWidthPx + 14;
                        } else if (door.wall === "bottom") {
                          hinge = [gapStartPx, wallPx];
                          openEnd = flipped ? [gapStartPx, wallPx + doorWidthPx] : [gapStartPx, wallPx - doorWidthPx];
                          labelX = gapStartPx;
                          labelY = flipped ? wallPx + doorWidthPx + 14 : wallPx - doorWidthPx - 6;
                        } else if (door.wall === "left") {
                          hinge = [wallPx, gapStartPx];
                          openEnd = flipped ? [wallPx - doorWidthPx, gapStartPx] : [wallPx + doorWidthPx, gapStartPx];
                          labelX = flipped ? wallPx - doorWidthPx - 4 : wallPx + doorWidthPx + 4;
                          labelY = gapStartPx + 10;
                        } else {
                          hinge = [wallPx, gapStartPx];
                          openEnd = flipped ? [wallPx + doorWidthPx, gapStartPx] : [wallPx - doorWidthPx, gapStartPx];
                          labelX = flipped ? wallPx + doorWidthPx + 4 : wallPx - doorWidthPx - 4;
                          labelY = gapStartPx + 10;
                        }
                        const closedEnd: [number, number] = door.wall === "top" || door.wall === "bottom" ? [gapEndPx, wallPx] : [wallPx, gapEndPx];
                        const label = door.label || (door.type === "main" ? "Main entrance" : door.type === "rear" ? "Rear garden door" : "Door");
                        const inwardSweep = door.wall === "top" || door.wall === "right" ? 1 : 0;
                        const sweepFlag = flipped ? 1 - inwardSweep : inwardSweep;

                        // Covers the door's full swing region (gap plus the arc extending in
                        // whichever direction it actually swings), not just the thin gap line —
                        // grabbing a door by its swing arc is the more natural, larger target.
                        let hitX: number, hitY: number, hitW: number, hitH: number;
                        if (door.wall === "top") {
                          [hitX, hitY, hitW, hitH] = flipped ? [gapStartPx, wallPx - doorWidthPx, doorWidthPx, doorWidthPx] : [gapStartPx, wallPx, doorWidthPx, doorWidthPx];
                        } else if (door.wall === "bottom") {
                          [hitX, hitY, hitW, hitH] = flipped ? [gapStartPx, wallPx, doorWidthPx, doorWidthPx] : [gapStartPx, wallPx - doorWidthPx, doorWidthPx, doorWidthPx];
                        } else if (door.wall === "left") {
                          [hitX, hitY, hitW, hitH] = flipped ? [wallPx - doorWidthPx, gapStartPx, doorWidthPx, doorWidthPx] : [wallPx, gapStartPx, doorWidthPx, doorWidthPx];
                        } else {
                          [hitX, hitY, hitW, hitH] = flipped ? [wallPx, gapStartPx, doorWidthPx, doorWidthPx] : [wallPx - doorWidthPx, gapStartPx, doorWidthPx, doorWidthPx];
                        }

                        return (
                          <g
                            key={index}
                            onPointerDown={(e) => handleExteriorDoorPointerDown(e, room.i, index)}
                            onPointerMove={handleExteriorDoorPointerMove}
                            onPointerUp={handleExteriorDoorPointerUp}
                            style={{ cursor: "grab", touchAction: "none" }}
                          >
                            <rect x={hitX} y={hitY} width={hitW} height={hitH} fill="transparent" />
                            {door.wall === "top" || door.wall === "bottom" ? (
                              <rect x={gapStartPx} y={wallPx - 3} width={doorWidthPx} height={6} fill="#FBF8F4" />
                            ) : (
                              <rect x={wallPx - 3} y={gapStartPx} width={6} height={doorWidthPx} fill="#FBF8F4" />
                            )}
                            <line x1={hinge[0]} y1={hinge[1]} x2={openEnd[0]} y2={openEnd[1]} stroke="#8B7355" strokeWidth="1" />
                            <path d={`M ${closedEnd[0]} ${closedEnd[1]} A ${doorWidthPx} ${doorWidthPx} 0 0 ${sweepFlag} ${openEnd[0]} ${openEnd[1]}`} fill="none" stroke="#8B7355" strokeWidth="1" />
                            <text x={labelX} y={labelY} fontSize="9" fill="#6B6A63" textAnchor={door.wall === "left" || door.wall === "right" ? "start" : "middle"}>
                              {label}
                            </text>
                          </g>
                        );
                      })}
                      {windowsForRoom.map((win) => {
                        const { gap } = win;
                        const gapStartPx = gap.start * PIXELS_PER_METRE;
                        const gapEndPx = gap.end * PIXELS_PER_METRE;
                        const gapWidthPx = gapEndPx - gapStartPx;
                        const wallPx = gap.fixed * PIXELS_PER_METRE;
                        const horizontal = win.wall === "top" || win.wall === "bottom";

                        return (
                          <g
                            key={win.index}
                            onPointerDown={(e) => handleWindowPointerDown(e, room.i, win.index)}
                            onPointerMove={handleWindowPointerMove}
                            onPointerUp={handleWindowPointerUp}
                            style={{ cursor: "grab", touchAction: "none" }}
                          >
                            {horizontal ? (
                              <>
                                <rect x={gapStartPx} y={wallPx - 8} width={gapWidthPx} height={16} fill="transparent" />
                                <rect x={gapStartPx} y={wallPx - 3} width={gapWidthPx} height={6} fill="#FBF8F4" />
                                <line x1={gapStartPx} y1={wallPx - 1.5} x2={gapEndPx} y2={wallPx - 1.5} stroke="#5B8AA6" strokeWidth="1" />
                                <line x1={gapStartPx} y1={wallPx + 1.5} x2={gapEndPx} y2={wallPx + 1.5} stroke="#5B8AA6" strokeWidth="1" />
                              </>
                            ) : (
                              <>
                                <rect x={wallPx - 8} y={gapStartPx} width={16} height={gapWidthPx} fill="transparent" />
                                <rect x={wallPx - 3} y={gapStartPx} width={6} height={gapWidthPx} fill="#FBF8F4" />
                                <line x1={wallPx - 1.5} y1={gapStartPx} x2={wallPx - 1.5} y2={gapEndPx} stroke="#5B8AA6" strokeWidth="1" />
                                <line x1={wallPx + 1.5} y1={gapStartPx} x2={wallPx + 1.5} y2={gapEndPx} stroke="#5B8AA6" strokeWidth="1" />
                              </>
                            )}
                          </g>
                        );
                      })}
                      {stairs &&
                        stairs.positions.map((pos, si) =>
                          stairs.vertical ? (
                            <line key={si} x1={0} y1={pos * PIXELS_PER_METRE} x2={wPx} y2={pos * PIXELS_PER_METRE} stroke="#25344A" strokeWidth="1" />
                          ) : (
                            <line key={si} x1={pos * PIXELS_PER_METRE} y1={0} x2={pos * PIXELS_PER_METRE} y2={lPx} stroke="#25344A" strokeWidth="1" />
                          )
                        )}
                      {stairs &&
                        (() => {
                          // Arrow runs the length of the stair, pointing toward whichever end
                          // matches the selected direction — "down" points from the near end
                          // toward the far end, "up" the reverse, matching the convention in
                          // real floor plans where the arrowhead shows the direction of travel.
                          const midX = wPx / 2;
                          const midY = lPx / 2;
                          const [ax1, ay1, ax2, ay2] = stairs.vertical
                            ? stairDir === "down"
                              ? [midX, lPx * 0.15, midX, lPx * 0.85]
                              : [midX, lPx * 0.85, midX, lPx * 0.15]
                            : stairDir === "down"
                              ? [wPx * 0.15, midY, wPx * 0.85, midY]
                              : [wPx * 0.85, midY, wPx * 0.15, midY];
                          return (
                            <g>
                              <line x1={ax1} y1={ay1} x2={ax2} y2={ay2} stroke="#25344A" strokeWidth="1.5" markerEnd="url(#stairArrowhead)" />
                            </g>
                          );
                        })()}
                      {stairs && (
                        <text x={wPx / 2} y={stairs.vertical ? lPx - 4 : lPx / 2 + 14} textAnchor="middle" fontSize="9" fontWeight="700" fill="#25344A">
                          {stairDir.toUpperCase()}
                        </text>
                      )}
                      {stairs && roomData?.stairLinkFloor && (
                        <text x={wPx / 2} y={stairs.vertical ? lPx - 15 : lPx / 2 + 25} textAnchor="middle" fontSize="8" fill="#8B7355">
                          ↔ {roomData.stairLinkFloor}
                        </text>
                      )}
                      {(() => {
                        const [centroidXm, centroidYm] = polygonCentroid(room.geometry.points);
                        const centerX = centroidXm * PIXELS_PER_METRE;
                        const centerY = centroidYm * PIXELS_PER_METRE;
                        const layout = roomLabelLayout(room.name, room.widthM, room.lengthM);
                        const transform = layout.mode === "rotated" ? `rotate(-90, ${centerX}, ${centerY})` : undefined;
                        return (
                          <>
                            <text x={centerX} y={centerY - 6} textAnchor="middle" fontSize={layout.fontSize} fontWeight="600" fill="#25344A" transform={transform}>
                              {room.name}
                            </text>
                            <text x={centerX} y={centerY + 10} textAnchor="middle" fontSize={Math.min(10, layout.fontSize)} fill="#6B6A63" transform={transform}>
                              {room.widthM}m × {room.lengthM}m
                            </text>
                          </>
                        );
                      })()}
                    </g>
                  );
                })}
                {doorGaps.map((door, di) => {
                  // The offset (+10) matches the same margin used everywhere else when
                  // translating metre coordinates into the SVG's pixel space.
                  const wallPx = door.wallPos * PIXELS_PER_METRE + 10;
                  const gapStartPx = door.gapStart * PIXELS_PER_METRE + 10;
                  const gapEndPx = door.gapEnd * PIXELS_PER_METRE + 10;
                  const doorWidthPx = gapEndPx - gapStartPx;

                  // Hinge normally at the gapStart side, door leaf swings toward whichever
                  // room is larger — unless flipped, which swaps hinge and closed-end to the
                  // other side of the doorway.
                  const hingePos = door.hingeAtStart ? gapStartPx : gapEndPx;
                  const closedPos = door.hingeAtStart ? gapEndPx : gapStartPx;
                  let hinge: [number, number], closedEnd: [number, number], openEnd: [number, number];
                  if (door.orientation === "vertical") {
                    hinge = [wallPx, hingePos];
                    closedEnd = [wallPx, closedPos];
                    openEnd = [wallPx + (door.swingIntoPositive ? doorWidthPx : -doorWidthPx), hingePos];
                  } else {
                    hinge = [hingePos, wallPx];
                    closedEnd = [closedPos, wallPx];
                    openEnd = [hingePos, wallPx + (door.swingIntoPositive ? doorWidthPx : -doorWidthPx)];
                  }
                  // Swapping which end is the hinge is a reflection of the geometry, and a
                  // reflection inverts the arc's handedness — so the sweep flag flips exactly
                  // when hingeAtStart is flipped (an XOR relationship), keeping this
                  // consistent with the already-confirmed-correct un-flipped case rather than
                  // re-deriving the direction from scratch.
                  const sweepFlag = door.swingIntoPositive !== door.hingeAtStart ? 1 : 0;

                  return (
                    <g key={di}>
                      {/* Background-coloured bar creating a genuine visual gap in the wall,
                          rather than a line floating on top of it. */}
                      {door.orientation === "vertical" ? (
                        <rect x={wallPx - 3} y={gapStartPx} width={6} height={gapEndPx - gapStartPx} fill="#FBF8F4" />
                      ) : (
                        <rect x={gapStartPx} y={wallPx - 3} width={gapEndPx - gapStartPx} height={6} fill="#FBF8F4" />
                      )}
                      <line x1={hinge[0]} y1={hinge[1]} x2={openEnd[0]} y2={openEnd[1]} stroke="#8B7355" strokeWidth="1" />
                      <path
                        d={`M ${closedEnd[0]} ${closedEnd[1]} A ${doorWidthPx} ${doorWidthPx} 0 0 ${sweepFlag} ${openEnd[0]} ${openEnd[1]}`}
                        fill="none"
                        stroke="#8B7355"
                        strokeWidth="1"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          )}

          {overlappingRoomIndices.size > 0 && (
            <p className="text-sm text-red-600 mt-3">
              ⚠ {overlappingRoomIndices.size === 1 ? "A room overlaps" : `${overlappingRoomIndices.size} rooms overlap`} another — outlined in red above. Drag them apart to fix.
            </p>
          )}

          <p className="text-xs text-slate mt-3">
            Drag any room to rearrange it. Connected rooms that are actually touching show a real gap in the shared wall as a doorway — if they're apart, a dashed line hints at the
            connection until you drag them together. Still a simplified block layout, not a full architectural plan.
          </p>
        </div>
      </div>
    </div>
  );
}
