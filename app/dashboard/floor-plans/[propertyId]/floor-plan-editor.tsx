"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { saveFloorPlan, deleteFloorPlan } from "@/lib/actions/floorplan";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import {
  MAX_DIMENSION_M,
  MAX_POINTS,
  constrainPoint,
  lineAngleDeg,
  normalizeDrawnPolygon,
  pointAtDistance,
  polygonArea,
  polygonSelfIntersects,
  rebuildCustomOutline,
  unitToLocal,
  visualCenter,
  edgeFrame,
  findSharedWallSegment,
  remapOpeningsAfterDelete,
  remapOpeningsAfterInsert,
  type DrawMode,
  type EdgeFrame,
  type Pt,
} from "@/lib/customRoomShape";

type Room = {
  name: string;
  widthM: string;
  lengthM: string;
  xM?: number;
  yM?: number;
  shape: "rectangle" | "bay-window" | "l-shape" | "angled-corner" | "trapezoid" | "sloped-top" | "custom";
  // A hand-drawn outline (shape "custom"): the room's corners as fractions (0-1) of its own
  // width and length, so a real corner is always fraction * widthM / fraction * lengthM.
  // Stored this way a drawn room's bounding box is exactly widthM x lengthM by construction,
  // which is what lets it resize, rotate, collide and lay out like every other room here with
  // no special cases. Always clockwise on screen, matching the built-in shapes.
  customPoints?: number[][];
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
  // Lets any individual wall of the room's final shape (after every modifier above has been
  // applied) be reshaped from a plain straight line into a zigzag or a rectangular alcove
  // recess - "edgeIndex" identifies which wall, numbered in order starting from the top-left
  // corner going clockwise. Deliberately cuts INWARD only (never bulges the wall outward) -
  // this guarantees the room's polygon always stays within its own widthM x lengthM bounding
  // box, which is what lets this integrate without needing to touch collision detection,
  // auto-layout, or the resize handles at all; every one of those already assumes that box.
  customWalls?: {
    edgeIndex: number;
    style: "zigzag" | "alcove";
    zigzagCount?: number;
    zigzagDepthM?: number;
    alcoveOffsetM?: number;
    alcoveWidthM?: number;
    alcoveDepthM?: number;
  }[];
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
  // edgeIndex (hand-drawn rooms only): which real wall of the outline the opening sits on, numbered
  // like the custom-wall controls. positionM is then the distance along THAT wall. Without it
  // (every other shape) the opening sits on a side of the bounding box, as before.
  exteriorDoors?: { type?: "main" | "rear"; label?: string; wall: "top" | "bottom" | "left" | "right"; positionM: number; swingFlipped?: boolean; edgeIndex?: number }[];
  windows?: { wall: "top" | "bottom" | "left" | "right"; positionM: number; edgeIndex?: number }[];
};
type Level = { name: string; rooms: Room[] };
type DrawCursor = { p: Pt; kind: "grid" | "vertex" | "close"; valid: boolean };

const PIXELS_PER_METRE = 40;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;

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

// Floor area of a room straight from its fields - the same geometry the plan draws, custom walls
// included - so totals that span floors that aren't on screen match what is drawn.
function roomAreaM2(r: Room): number {
  const n = (v?: string) => (v ? parseFloat(v) : undefined);
  const geo = roomGeometry({
    shape: r.shape,
    widthM: parseFloat(r.widthM),
    lengthM: parseFloat(r.lengthM),
    bayWidthM: n(r.bayWidthM),
    bayDepthM: n(r.bayDepthM),
    notchWidthM: n(r.notchWidthM),
    notchDepthM: n(r.notchDepthM),
    notchCorner: r.notchCorner,
    angledCutWidthM: n(r.angledCutWidthM),
    angledCutDepthM: n(r.angledCutDepthM),
    angledCorner: r.angledCorner,
    trapezoidTopWidthM: n(r.trapezoidTopWidthM),
    trapezoidSide: r.trapezoidSide,
    slopedTopAmountM: n(r.slopedTopAmountM),
    slopedTopSide: r.slopedTopSide,
    hasBayWindow: r.hasBayWindow,
    customPoints: r.customPoints,
    customWalls: r.customWalls,
  });
  return polygonAreaM2(geo.points);
}

// Genuine floor area from a room's actual polygon (shoelace formula, in the same metre space
// as room.geometry.points) - not a naive width x length, since a room with a wall cut into it
// (zigzag, alcove) or a hand-drawn outline genuinely has less floor area than its bounding box.
function polygonAreaM2(pointsInMetres: number[][]): number {
  const n = pointsInMetres.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = pointsInMetres[i];
    const [x2, y2] = pointsInMetres[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
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
  customPoints?: number[][];
}) {
  const w = room.widthM;
  const l = room.lengthM;

  // A hand-drawn outline: the stored 0-1 corners scaled by the room's own width and length.
  if (room.shape === "custom" && room.customPoints && room.customPoints.length >= 3) {
    return { points: room.customPoints.map(([u, v]) => [u * w, v * l]), footprintHeight: l };
  }

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
// Replaces a single straight edge (from point a to point b) with a zigzag - `count` inward-
// pointing teeth, each cutting `depthM` into the room. Returns the full replacement point
// list INCLUDING both a and b at the start/end, so callers splice out just the middle when
// inserting this back into a larger polygon (never re-include a/b themselves, or the shared
// vertex with the neighbouring edge gets duplicated).
function zigzagEdgePoints(a: number[], b: number[], count: number, depthM: number): number[][] {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0 || count < 1) return [a, b];
  const ux = dx / length;
  const uy = dy / length;
  // Inward normal for this polygon's winding (clockwise in screen/SVG coordinates, where Y
  // increases downward) - verified against the existing base rectangle's own point order.
  const ix = -uy;
  const iy = ux;
  const segments = count * 2;
  const points: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let px = ax + dx * t;
    let py = ay + dy * t;
    if (i % 2 === 1) {
      px += ix * depthM;
      py += iy * depthM;
    }
    points.push([px, py]);
  }
  return points;
}

// Replaces part of a straight edge with a rectangular recess (alcove), starting offsetM
// along the edge from a, alcoveWidthM wide, cutting alcoveDepthM into the room. Same
// include-both-endpoints convention as zigzagEdgePoints above.
function alcoveEdgePoints(a: number[], b: number[], offsetM: number, alcoveWidthM: number, alcoveDepthM: number): number[][] {
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length === 0) return [a, b];
  const ux = dx / length;
  const uy = dy / length;
  const ix = -uy;
  const iy = ux;
  const p1 = [ax + ux * offsetM, ay + uy * offsetM];
  const p2 = [p1[0] + ix * alcoveDepthM, p1[1] + iy * alcoveDepthM];
  const p3 = [p2[0] + ux * alcoveWidthM, p2[1] + uy * alcoveWidthM];
  const p4 = [ax + ux * (offsetM + alcoveWidthM), ay + uy * (offsetM + alcoveWidthM)];
  return [a, p1, p2, p3, p4, b];
}

// Splices every customized wall into the room's final polygon (after base shape and any bay
// window have already been applied). For each edge, only the NEW intermediate points get
// inserted - both endpoints are skipped, since they're already the surrounding polygon's own
// vertices and re-including them would create a duplicate, degenerate point exactly where two
// edges meet.
function applyCustomWalls(points: number[][], customWalls?: Room["customWalls"]): number[][] {
  if (!customWalls || customWalls.length === 0) return points;
  const n = points.length;
  const result: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    result.push(a);
    const custom = customWalls.find((w) => w.edgeIndex === i);
    if (!custom) continue;

    const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (custom.style === "zigzag" && custom.zigzagCount && custom.zigzagCount > 0 && custom.zigzagCount <= 20 && custom.zigzagDepthM && custom.zigzagDepthM > 0) {
      const edgePoints = zigzagEdgePoints(a, b, custom.zigzagCount, custom.zigzagDepthM);
      result.push(...edgePoints.slice(1, -1));
    } else if (
      custom.style === "alcove" &&
      custom.alcoveWidthM &&
      custom.alcoveWidthM > 0 &&
      custom.alcoveDepthM &&
      custom.alcoveDepthM > 0 &&
      (custom.alcoveOffsetM || 0) >= 0 &&
      (custom.alcoveOffsetM || 0) + custom.alcoveWidthM <= edgeLength
    ) {
      const edgePoints = alcoveEdgePoints(a, b, custom.alcoveOffsetM || 0, custom.alcoveWidthM, custom.alcoveDepthM);
      result.push(...edgePoints.slice(1, -1));
    }
    // An invalid/out-of-range configuration (e.g. an alcove wider than the wall it's on)
    // falls through silently to the plain, unmodified edge, same defensive pattern as every
    // other shape modifier in this file - never render broken, self-intersecting geometry.
  }
  return result;
}


function roomGeometry(room: Parameters<typeof computeBaseRoomGeometry>[0] & { hasBayWindow?: boolean; customWalls?: Room["customWalls"] }) {
  const base = computeBaseRoomGeometry(room);

  if (
    room.shape !== "bay-window" &&
    room.shape !== "custom" &&
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
      return { points: applyCustomWalls(combined, room.customWalls), footprintHeight: base.footprintHeight + room.bayDepthM };
    }
    // The base shape's own modifier already touches the bottom edge (a bottom-left/
    // bottom-right notch or angled corner) - falls back to the base shape alone rather than
    // risk broken, self-intersecting geometry from two modifiers fighting over the same edge.
  }

  return { points: applyCustomWalls(base.points, room.customWalls), footprintHeight: base.footprintHeight };
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
    customPoints?: number[][];
    customWalls?: Room["customWalls"];
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
    // A rotated room's position is the corner of the box it had BEFORE it was turned, but the room it
    // actually draws sits in a different box. bboxMinX/bboxMinY is how far that visible box starts from the
    // position corner (zero for an upright room). Placing rooms by the position corner alone made a rotated
    // room overlap its neighbours - and could push part of it off the canvas.
    const turned = (r.rotationDeg || 0) % 360 !== 0;
    return { ...r, geometry, packWidth: bbox.width, packHeight: bbox.height, bboxMinX: turned ? bbox.minX : 0, bboxMinY: turned ? bbox.minY : 0 };
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

    const x = room.xM ?? autoX - room.bboxMinX;
    const y = room.yM ?? autoY - room.bboxMinY;
    return { ...room, x, y, color: ROOM_COLORS[room.i % ROOM_COLORS.length] };
  });

  const totalWidth = Math.max(...positioned.map((r) => r.x + r.bboxMinX + r.packWidth), 0);
  const totalHeight = Math.max(...positioned.map((r) => r.y + r.bboxMinY + r.packHeight), 0);

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
// The real wall of a hand-drawn room (numbered like the custom-wall controls), in the room's own metres.
function roomEdgeFrame(r: Room, edgeIndex: number): EdgeFrame | null {
  if (r.shape !== "custom" || !r.customPoints) return null;
  const w = parseFloat(r.widthM);
  const l = parseFloat(r.lengthM);
  if (!(w > 0) || !(l > 0)) return null;
  return edgeFrame(unitToLocal(r.customPoints, w, l), edgeIndex);
}

// Every wall of a hand-drawn room as a choice ("Wall 3 · 2.40 m") for the door and window controls.
function customWallChoices(r: Room): { index: number; label: string; length: number }[] {
  if (r.shape !== "custom" || !r.customPoints) return [];
  const pts = unitToLocal(r.customPoints, parseFloat(r.widthM) || 0, parseFloat(r.lengthM) || 0);
  return pts.map((_, k) => {
    const length = edgeFrame(pts, k)?.length ?? 0;
    return { index: k, label: `Wall ${k + 1} · ${length.toFixed(2)} m`, length };
  });
}

// The sensible default wall for a new door or window: the longest one.
function longestWall(r: Room) {
  const choices = customWallChoices(r);
  return choices.reduce((best, c) => (c.length > best.length ? c : best), choices[0] ?? { index: 0, label: "", length: 0 });
}

// A positioned room's outline on the plan itself, rotation applied.
function worldOutline(room: { x: number; y: number; widthM: number; lengthM: number; rotationDeg?: number; geometry: { points: number[][] } }): Pt[] {
  return room.geometry.points.map(([px, py]) => {
    const [lx, ly] = room.rotationDeg ? rotatePoint(px, py, room.widthM / 2, room.lengthM / 2, room.rotationDeg) : [px, py];
    return { x: room.x + lx, y: room.y + ly };
  });
}

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
// Shared by room-position snapping, resize snapping, and the drawing tool, so a dragged room,
// a resized room, and a drawn wall all land on exactly the same grid.
const GRID_SIZE = 0.1;
const GRID_THRESHOLD = 0.05;
const nearestGridLine = (v: number) => Math.round(v / GRID_SIZE) * GRID_SIZE;

// The rectangle a room really occupies on the plan, for lining it up against its neighbours. An upright room
// is its position corner plus its width and footprint height, as always. A ROTATED room is the box around its
// rotated outline, and (dx, dy) is how far that box starts from the corner the room's position is measured
// from - so a rotated room snaps by what you see, not by where it would sit if it were upright.
function snapBox(p: { x: number; y: number; widthM: number; packWidth: number; packHeight: number; bboxMinX: number; bboxMinY: number; rotationDeg?: number; geometry: { footprintHeight: number } }) {
  const turned = (p.rotationDeg || 0) % 360 !== 0;
  return turned
    ? { x: p.x + p.bboxMinX, y: p.y + p.bboxMinY, w: p.packWidth, h: p.packHeight, dx: p.bboxMinX, dy: p.bboxMinY }
    : { x: p.x, y: p.y, w: p.widthM, h: p.geometry.footprintHeight, dx: 0, dy: 0 };
}

// The smallest a room's position can be, so that its VISIBLE outline never hangs off the top or left of the
// canvas. For an upright room that is 0. For a rotated room the outline can start away from the position corner
// on either side, so the position itself can legitimately need to be negative (it is only a reference point
// for the room's own frame, not a corner you can see - and it is stored as a plain number, negatives included).
const minOrigin = (bboxMin: number) => -bboxMin;

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

  // Grid snapping - complementary to snapping onto another room's edge below: it works with
  // nothing nearby to align against. A tighter threshold than the edge-snap's means an aligned
  // neighbour still wins the "closest wins" contest when both are close enough to matter.
  const gridXCandidates: [number, number][] = [
    [Math.abs(dLeft - nearestGridLine(dLeft)), nearestGridLine(dLeft)],
    [Math.abs(dRight - nearestGridLine(dRight)), nearestGridLine(dRight) - widthM],
  ];
  for (const [dist, snap] of gridXCandidates) {
    if (dist < GRID_THRESHOLD && dist < bestXDist) {
      bestXDist = dist;
      snappedX = snap;
    }
  }
  const gridYCandidates: [number, number][] = [
    [Math.abs(dTop - nearestGridLine(dTop)), nearestGridLine(dTop)],
    [Math.abs(dBottom - nearestGridLine(dBottom)), nearestGridLine(dBottom) - heightM],
  ];
  for (const [dist, snap] of gridYCandidates) {
    if (dist < GRID_THRESHOLD && dist < bestYDist) {
      bestYDist = dist;
      snappedY = snap;
    }
  }

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
  // Switching floors swaps the whole room list and coordinate space underneath a measurement,
  // the selected room, and any outline being drawn - without this a stale index could silently
  // point at a different room on the new floor.
  useEffect(() => {
    setMeasureStart(null);
    setMeasureEnd(null);
    setSelectedRoomIndex(null);
    setSelectedVertex(null);
    setDrawPoints([]);
    setDrawCursor(null);
  }, [activeLevel]);
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
  const [showDimensions, setShowDimensions] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [showGrid, setShowGrid] = useState(false);
  // Zoom (1 = the plan at its natural size) and whether the main pointer is a finger. See "Zoom, pan and
  // multi-touch" further down.
  const [zoom, setZoom] = useState(1);
  const [anchorTick, setAnchorTick] = useState(0); // bumped each time a zoom anchor is set, so it is always applied even if two updates cancel out
  const [coarse, setCoarse] = useState(false);
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null);
  // The corner of a hand-drawn room that was touched last - what the "Delete corner" button acts on, since
  // deleting a corner by double-click does not work on a touch screen.
  const [selectedVertex, setSelectedVertex] = useState<{ roomIndex: number; vertexIndex: number } | null>(null);
  const [cornerMessage, setCornerMessage] = useState(""); // why a corner could not be removed
  // Which room is "selected" - set when a room is clicked or dragged. Gives arrow-key nudging
  // and a hand-drawn room's corner handles an unambiguous target.
  const [selectedRoomIndex, setSelectedRoomIndex] = useState<number | null>(null);
  const [measureMode, setMeasureMode] = useState(false);
  const [measureStart, setMeasureStart] = useState<{ x: number; y: number } | null>(null);
  const [measureEnd, setMeasureEnd] = useState<{ x: number; y: number } | null>(null);
  // Freehand CAD-style room drawing. Corners are in world metres (the space room positions use).
  const [drawMode, setDrawMode] = useState(false);
  const [drawPoints, setDrawPoints] = useState<Pt[]>([]);
  const [drawCursor, setDrawCursor] = useState<DrawCursor | null>(null);
  const [drawAngleMode, setDrawAngleMode] = useState<DrawMode>("ortho");
  const [drawName, setDrawName] = useState("");
  const [typedLength, setTypedLength] = useState("");
  const [drawMessage, setDrawMessage] = useState("");
  const lengthInputRef = useRef<HTMLInputElement>(null);
  const vertexDragRef = useRef<{ roomIndex: number; vertexIndex: number; group: SVGGraphicsElement } | null>(null);
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
      if (drawMode && handleDrawKey(e)) return;
      const target = e.target as HTMLElement;
      const isTextInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
      if (isTextInput) return;

      // Arrow-key nudging of whichever room was last clicked - a small, precise move per press
      // (a larger one with Shift held), routed through updateRooms so it shares the same undo history.
      if (!e.ctrlKey && !e.metaKey && selectedRoomIndex !== null && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const nudge = e.shiftKey ? 0.5 : 0.05;
        const [dx, dy] = e.key === "ArrowLeft" ? [-nudge, 0] : e.key === "ArrowRight" ? [nudge, 0] : e.key === "ArrowUp" ? [0, -nudge] : [0, nudge];
        // Start from where the room really sits - a room that was only clicked (never dragged) has no
        // stored position yet, and starting from 0 would teleport it to the top-left corner.
        const sitting = positioned.find((p) => p.i === selectedRoomIndex);
        updateRooms((rs) =>
          rs.map((r, i) => {
            if (i !== selectedRoomIndex) return r;
            const x = Math.max(minOrigin(sitting?.bboxMinX ?? 0), (r.xM ?? sitting?.x ?? 0) + dx);
            const y = Math.max(minOrigin(sitting?.bboxMinY ?? 0), (r.yM ?? sitting?.y ?? 0) + dy);
            return { ...r, xM: x, yM: y };
          })
        );
        return;
      }

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
  const removeRoom = (index: number) => {
    setSelectedRoomIndex(null); // deleting a room shifts every later index - a stale selection could silently act on the wrong room
    updateRooms((rs) => rs.filter((_, i) => i !== index));
  };

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
      customPoints: r.customPoints,
      customWalls: r.customWalls,
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

  // While drawing, the canvas always leaves blank space to draw in, and grows as corners are
  // placed towards its edge - otherwise a plan with no rooms yet would have nowhere to draw.
  const drawExtentX = drawPoints.reduce((m, p) => Math.max(m, p.x), 0) + 4;
  const drawExtentY = drawPoints.reduce((m, p) => Math.max(m, p.y), 0) + 4;
  const canvasWm = drawMode ? Math.min(60, Math.max(totalWidth + 4, 14, drawExtentX)) : showGrid ? Math.max(totalWidth, 1) : totalWidth;
  const canvasHm = drawMode ? Math.min(60, Math.max(totalHeight + 4, 10, drawExtentY)) : showGrid ? Math.max(totalHeight, 1) : totalHeight;

  // Deduplicated by which actual pair of rooms is involved (regardless of which room's
  // connectedTo list the reference happens to live in), not by index order — a connection
  // only stored on one side, where that side happens to come later in the room list, was
  // previously discarded entirely rather than just avoiding a duplicate line.
  const doorGaps: { orientation: "vertical" | "horizontal"; wallPos: number; gapStart: number; gapEnd: number; swingIntoPositive: boolean; hingeAtStart: boolean }[] = [];
  // Doors between rooms where at least one is hand-drawn: found from the real outlines, drawn along the shared wall at its own angle.
  const angledDoors: { x: number; y: number; angleDeg: number; width: number; swingIntoPositive: boolean; hingeAtStart: boolean }[] = [];
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

      // A hand-drawn room's walls don't line up with a bounding box - and neither do a rotated room's, whose
      // outline is turned away from the box it was laid out in - so any door to or from either kind is found
      // from the real outlines. Only two plain, upright rooms can be compared by their boxes.
      const isTurned = (p: { rotationDeg?: number }) => (p.rotationDeg || 0) % 360 !== 0;
      const eitherCustom = rooms[room.i]?.shape === "custom" || rooms[target.i]?.shape === "custom" || isTurned(room) || isTurned(target);
      const segment = eitherCustom ? findSharedWallSegment(worldOutline(room), worldOutline(target)) : null;
      if (segment) {
        const sx = segment.end.x - segment.start.x;
        const sy = segment.end.y - segment.start.y;
        const segLen = Math.hypot(sx, sy);
        const dir = { x: sx / segLen, y: sy / segLen };
        const segGap = doorGap(0, segLen);
        // Swing into the larger room, as for any other door: is that room's centre on the +y (left-hand) side of the wall?
        const bigger = polygonAreaM2(room.geometry.points) >= polygonAreaM2(target.geometry.points) ? room : target;
        const [bigX, bigY] = polygonCentroid(worldOutline(bigger).map((p) => [p.x, p.y]));
        const midX = (segment.start.x + segment.end.x) / 2;
        const midY = (segment.start.y + segment.end.y) / 2;
        const autoInto = (bigX - midX) * -dir.y + (bigY - midY) * dir.x > 0;
        const segTargetName = rooms[target.i]?.name.trim() || "";
        const segRoomName = rooms[room.i]?.name.trim() || "";
        const segFlipped = (rooms[room.i]?.flippedSwingConnections || []).includes(segTargetName) || (rooms[target.i]?.flippedSwingConnections || []).includes(segRoomName);
        const segHingeFlipped = (rooms[room.i]?.flippedHingeConnections || []).includes(segTargetName) || (rooms[target.i]?.flippedHingeConnections || []).includes(segRoomName);
        angledDoors.push({
          x: segment.start.x + dir.x * segGap.start,
          y: segment.start.y + dir.y * segGap.start,
          angleDeg: (Math.atan2(dir.y, dir.x) * 180) / Math.PI,
          width: segGap.end - segGap.start,
          swingIntoPositive: segFlipped ? !autoInto : autoInto,
          hingeAtStart: !segHingeFlipped,
        });
        continue;
      }
      const wall = eitherCustom
        ? null
        : findSharedWall(
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
  const totalAreaM2 = positioned.reduce((sum, r) => sum + polygonAreaM2(r.geometry.points), 0);
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
        .reduce((roomSum, r) => roomSum + roomAreaM2(r), 0),
    0
  );

  // rawX/rawY track where the room "actually" is based purely on accumulated mouse movement,
  // completely separate from the snapped value shown/saved as xM/yM — without this, snapping
  // the displayed position would corrupt the next delta calculation, since it would compute
  // from the snapped position instead of where the mouse genuinely is, causing the room to
  // drift out of sync with the pointer more and more with every snap.
  const dragRef = useRef<{ roomIndex: number; lastClientX: number; lastClientY: number; rawX: number; rawY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Screen pixels per SVG unit right now: 1 at normal size, more when the plan is zoomed in, less when
  // zoomed out (or whenever the browser scales the drawing for any other reason). Every drag that works
  // from how far the pointer MOVED - as opposed to where it IS - has to divide by this, or it moves
  // things the wrong distance: at 2x zoom a 1 m drag would move a room 2 m.
  const screenScale = () => {
    const m = svgRef.current?.getScreenCTM();
    return m && m.a > 0 ? m.a : 1;
  };
  const clientDeltaToMetres = (deltaClientPx: number) => deltaClientPx / (screenScale() * PIXELS_PER_METRE);
  // How far a room's visible outline starts from the corner its position is measured from: zero for an upright
  // room. The typed Position boxes show and take the visible top-left, which is what the eye sees.
  const outlineOffset = (roomIndex: number) => {
    const p = positioned.find((q) => q.i === roomIndex);
    return { x: p?.bboxMinX ?? 0, y: p?.bboxMinY ?? 0 };
  };
  const roundCm = (v: number) => Math.round(v * 100) / 100;
  // A finger drawing a room aims first and places the corner when it lifts.
  const touchDrawRef = useRef<{ id: number } | null>(null);
  // For the touch equivalent of double-clicking a corner (two quick taps), and to stop the double-click that
  // some browsers then also report from deleting a second corner.
  const lastVertexTapRef = useRef<{ roomIndex: number; vertexIndex: number; time: number; x: number; y: number } | null>(null);
  const lastTouchDeleteRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent, room: (typeof positioned)[number]) => {
    if (measureMode || drawMode) return; // measuring or drawing takes priority - a click on a room is then a point on the plan, not a drag
    dragRef.current = { roomIndex: room.i, lastClientX: e.clientX, lastClientY: e.clientY, rawX: room.x, rawY: room.y };
    (e.target as Element).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragHasCommittedRef.current = false;
    setSelectedRoomIndex(room.i);
  };

  // Converts a screen position into the SVG's own coordinate space using the browser's real
  // screen-to-SVG transform, correct wherever the SVG sits on the page or however it's scaled.
  const getSvgPoint = (e: React.PointerEvent): { x: number; y: number } | null => {
    if (!svgRef.current) return null;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return null;
    const svgPoint = pt.matrixTransform(ctm.inverse());
    return { x: svgPoint.x, y: svgPoint.y };
  };

  const handleSvgPointerDown = (e: React.PointerEvent) => {
    if (drawMode) {
      // A finger aims first and places the corner when it LIFTS: touching down only moves the preview, so the
      // corner can be nudged into place, and a second finger landing for a pinch never drops a stray corner. A
      // mouse or pen places on press, as always.
      if (e.pointerType === "touch") {
        touchDrawRef.current = { id: e.pointerId };
        updateDrawCursor(e);
        return;
      }
      handleDrawPointerDown(e);
      return;
    }
    if (!measureMode) return;
    const point = getSvgPoint(e);
    if (!point) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setMeasureStart(point);
    setMeasureEnd(point);
  };

  const handleSvgDoubleClick = () => {
    if (drawMode && drawPoints.length >= 3) finishDrawing();
  };

  // ---------------------------------------------------------------------------------------
  // Freehand, CAD-style room drawing. Corners are placed in world metres. Every corner snaps to
  // the shared grid, walls can be locked to 90° (ortho) or 45° angles measured from the last
  // corner, corners snap onto the corners of rooms already on the plan, and an exact length can
  // be typed for the wall being drawn. An outline that would cross itself is never accepted.
  // ---------------------------------------------------------------------------------------
  const svgToWorld = (e: React.PointerEvent): Pt | null => {
    const p = getSvgPoint(e);
    if (!p) return null;
    return { x: Math.max(0, (p.x - 10) / PIXELS_PER_METRE), y: Math.max(0, (p.y - 10) / PIXELS_PER_METRE) };
  };

  const worldCorners = (): Pt[] =>
    positioned.flatMap((room) =>
      room.geometry.points.map(([px, py]) => {
        const [lx, ly] = room.rotationDeg ? rotatePoint(px, py, room.widthM / 2, room.lengthM / 2, room.rotationDeg) : [px, py];
        return { x: room.x + lx, y: room.y + ly };
      })
    );

  const resolveDrawPoint = (raw: Pt, shift: boolean): DrawCursor => {
    const last = drawPoints.length > 0 ? drawPoints[drawPoints.length - 1] : null;
    // 8px on screen with a mouse, 22px for a finger - in metres, so zooming in makes the snap finer, as in any CAD tool.
    const SNAP_RADIUS = (coarse ? 22 : 8) / (PIXELS_PER_METRE * zoom);

    // Close the shape: near the first corner, once there are enough corners for a room.
    if (drawPoints.length >= 3 && Math.hypot(raw.x - drawPoints[0].x, raw.y - drawPoints[0].y) <= SNAP_RADIUS * 1.5) {
      return { p: drawPoints[0], kind: "close", valid: !polygonSelfIntersects(drawPoints, true) };
    }

    // Object snap: the corners of rooms that are already on the plan.
    let nearest: Pt | null = null;
    let nearestDist = SNAP_RADIUS;
    for (const corner of worldCorners()) {
      const d = Math.hypot(raw.x - corner.x, raw.y - corner.y);
      if (d <= nearestDist) {
        nearest = corner;
        nearestDist = d;
      }
    }

    let p: Pt;
    let kind: "grid" | "vertex" = "grid";
    if (nearest) {
      p = nearest;
      kind = "vertex";
    } else {
      // Shift temporarily flips the lock: free when locked, ortho when already free.
      const mode: DrawMode = shift ? (drawAngleMode === "free" ? "ortho" : "free") : drawAngleMode;
      p = last ? constrainPoint(last, raw, mode, GRID_SIZE) : { x: nearestGridLine(raw.x), y: nearestGridLine(raw.y) };
      p = { x: Math.max(0, p.x), y: Math.max(0, p.y) };
    }
    const valid = !last || (Math.hypot(p.x - last.x, p.y - last.y) >= 0.05 && !polygonSelfIntersects([...drawPoints, p], false));
    return { p, kind, valid };
  };

  const updateDrawCursor = (e: React.PointerEvent) => {
    const raw = svgToWorld(e);
    if (raw) setDrawCursor(resolveDrawPoint(raw, e.shiftKey));
  };

  const placeDrawPoint = (p: Pt) => {
    setDrawPoints((prev) => (prev.length >= MAX_POINTS ? prev : [...prev, p]));
    setTypedLength("");
    setDrawMessage("");
  };

  const startDrawing = () => {
    setMeasureMode(false);
    setMeasureStart(null);
    setMeasureEnd(null);
    setSelectedRoomIndex(null);
    setDrawPoints([]);
    setDrawCursor(null);
    setTypedLength("");
    setDrawMessage("");
    setDrawName("");
    setDrawMode(true);
  };

  const stopDrawing = () => {
    setDrawMode(false);
    setDrawPoints([]);
    setDrawCursor(null);
    setTypedLength("");
    setDrawMessage("");
  };

  const undoDrawPoint = () => {
    setDrawPoints((prev) => prev.slice(0, -1));
    setTypedLength("");
    setDrawMessage("");
  };

  const cycleDrawMode = () => setDrawAngleMode((m) => (m === "ortho" ? "polar" : m === "polar" ? "free" : "ortho"));

  const finishDrawing = () => {
    if (drawPoints.length < 3) {
      setDrawMessage("A room needs at least 3 corners.");
      return;
    }
    const outline = normalizeDrawnPolygon(drawPoints);
    if (!outline) {
      setDrawMessage("That outline can't be used - it must not cross itself, be under 0.3 m across, or be over 30 m.");
      return;
    }
    // Pin every existing room where it currently sits before adding the new one. Rooms that have
    // never been dragged are placed automatically, so without this the auto-layout could shuffle
    // them onto the outline that was just drawn.
    const frozen = new Map(positioned.map((r) => [r.i, { x: r.x, y: r.y }]));
    // A brand-new plan starts with one blank placeholder row - drop completely empty rows so the
    // drawn room takes its place instead of sitting beside a blank one.
    const isBlank = (r: Room) => !r.name.trim() && !r.widthM && !r.lengthM;
    const newIndex = rooms.filter((r) => !isBlank(r)).length;
    const takenNames = new Set(rooms.map((r) => r.name.trim().toLowerCase()));
    let nextNumber = newIndex + 1;
    while (takenNames.has(`room ${nextNumber}`)) nextNumber++;
    const roomName = drawName.trim() || `Room ${nextNumber}`;
    updateRooms((rs) => [
      ...rs.flatMap((r, i) => {
        if (isBlank(r)) return [];
        const pos = frozen.get(i);
        return [pos && (r.xM == null || r.yM == null) ? { ...r, xM: pos.x, yM: pos.y } : r];
      }),
      {
        name: roomName,
        widthM: outline.widthM.toFixed(2),
        lengthM: outline.lengthM.toFixed(2),
        xM: outline.xM,
        yM: outline.yM,
        shape: "custom",
        customPoints: outline.unitPoints,
        manualRoomTypes: [], // no auto-guessed fixtures inside an irregular outline - add them deliberately
      },
    ]);
    setSelectedRoomIndex(newIndex);
    setDrawPoints([]);
    setDrawCursor(null);
    setTypedLength("");
    setDrawName("");
    setDrawMessage(`Added "${roomName}". Keep drawing another room, or press Done and click it to drag its corners.`);
  };

  const placeTypedLength = () => {
    const last = drawPoints[drawPoints.length - 1];
    if (!last) {
      setDrawMessage("Click a start point first, then type a wall length.");
      return;
    }
    const length = parseFloat(typedLength);
    if (!(length >= 0.05 && length <= MAX_DIMENSION_M)) {
      setDrawMessage("Enter a wall length between 0.05 and 30 m.");
      return;
    }
    const p = pointAtDistance(last, drawCursor?.p ?? { x: last.x + 1, y: last.y }, length);
    if (drawPoints.length >= 3 && Math.hypot(p.x - drawPoints[0].x, p.y - drawPoints[0].y) < 0.005) {
      finishDrawing(); // the typed length runs exactly back to the first corner
      return;
    }
    if (p.x < 0 || p.y < 0) {
      setDrawMessage("That would run off the top or left of the plan - change direction, or start further in.");
      return;
    }
    if (polygonSelfIntersects([...drawPoints, p], false)) {
      setDrawMessage("That wall would cross the outline.");
      return;
    }
    placeDrawPoint(p);
  };

  const handleDrawPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const raw = svgToWorld(e);
    if (!raw) return;
    const cur = resolveDrawPoint(raw, e.shiftKey);
    setDrawCursor(cur);
    if (cur.kind === "close") {
      if (cur.valid) finishDrawing();
      else setDrawMessage("Closing here would make the outline cross itself.");
      return;
    }
    if (!cur.valid) {
      if (drawPoints.length > 0) setDrawMessage("That wall is too short or would cross the outline.");
      return;
    }
    placeDrawPoint(cur.p);
  };

  const handleDrawKey = (e: KeyboardEvent): boolean => {
    const target = e.target as HTMLElement;
    const inText = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
    if (e.key === "Escape") {
      e.preventDefault();
      if (typedLength) setTypedLength("");
      else if (drawPoints.length > 0) {
        setDrawPoints([]);
        setDrawCursor(null);
      } else stopDrawing();
      return true;
    }
    // Ctrl/Cmd+Z takes back the last corner while an outline is in progress, like CAD.
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "z" && !inText && drawPoints.length > 0) {
      e.preventDefault();
      undoDrawPoint();
      return true;
    }
    if (inText || e.ctrlKey || e.metaKey || e.altKey) return false;
    if (e.key === "Backspace") {
      e.preventDefault();
      undoDrawPoint();
      return true;
    }
    if (e.key === "Enter" && target.tagName === "BUTTON") return false; // keep Enter working on a focused button
    if (e.key === "Enter") {
      e.preventDefault();
      finishDrawing();
      return true;
    }
    if (e.key.toLowerCase() === "o" || e.key === "F8") {
      e.preventDefault();
      cycleDrawMode();
      return true;
    }
    // Just start typing a number and it goes to the length box, like AutoCAD's dynamic input.
    if (/^[0-9.]$/.test(e.key) && drawPoints.length > 0) {
      e.preventDefault();
      setTypedLength((t) => t + e.key);
      lengthInputRef.current?.focus();
      return true;
    }
    return false;
  };

  // ---- Editing the corners of an existing hand-drawn room ----------------------------------
  const pointerToLocalM = (e: React.PointerEvent, group: SVGGraphicsElement): Pt | null => {
    const svg = svgRef.current;
    const ctm = group.getScreenCTM();
    if (!svg || !ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    return { x: local.x / PIXELS_PER_METRE, y: local.y / PIXELS_PER_METRE };
  };

  const currentCustomRoom = (roomIndex: number) => {
    const r = rooms[roomIndex];
    const pos = positioned.find((p) => p.i === roomIndex);
    if (!r || r.shape !== "custom" || !r.customPoints || !pos) return null;
    const w = parseFloat(r.widthM);
    const l = parseFloat(r.lengthM);
    if (!(w > 0) || !(l > 0)) return null;
    return {
      w,
      l,
      origin: { x: pos.x, y: pos.y },
      rotation: r.rotationDeg ? parseFloat(r.rotationDeg) || 0 : 0,
      points: unitToLocal(r.customPoints, w, l),
    };
  };

  // Applies a corner edit. rebuildCustomOutline re-derives the room's size, position and unit
  // outline so every untouched corner stays exactly where it was on the plan - rotation included.
  const commitCustomEdit = (roomIndex: number, nextLocal: Pt[], clearWalls = false, extra: Partial<Room> = {}): boolean => {
    const cur = currentCustomRoom(roomIndex);
    if (!cur) return false;
    const rebuilt = rebuildCustomOutline(nextLocal, cur.w, cur.l, cur.origin, cur.rotation);
    if (!rebuilt) return false;
    updateRoom(roomIndex, {
      widthM: rebuilt.widthM.toFixed(2),
      lengthM: rebuilt.lengthM.toFixed(2),
      xM: rebuilt.xM,
      yM: rebuilt.yM,
      customPoints: rebuilt.unitPoints,
      ...(clearWalls ? { customWalls: undefined } : {}),
      ...extra,
    });
    return true;
  };

  const handleVertexPointerDown = (e: React.PointerEvent, roomIndex: number, vertexIndex: number) => {
    e.stopPropagation(); // otherwise the room's own drag handler on the parent <g> fires too
    // A finger cannot double-click, so two quick taps on the same corner delete it instead.
    if (e.pointerType === "touch") {
      const last = lastVertexTapRef.current;
      const now = Date.now();
      if (last && last.roomIndex === roomIndex && last.vertexIndex === vertexIndex && now - last.time < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24) {
        lastVertexTapRef.current = null;
        lastTouchDeleteRef.current = now;
        deleteVertex(roomIndex, vertexIndex);
        return;
      }
      lastVertexTapRef.current = { roomIndex, vertexIndex, time: now, x: e.clientX, y: e.clientY };
    }
    setSelectedVertex({ roomIndex, vertexIndex });
    setCornerMessage("");
    const group = (e.currentTarget as SVGElement).parentNode as SVGGraphicsElement | null;
    if (!group) return;
    vertexDragRef.current = { roomIndex, vertexIndex, group };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    isDraggingRef.current = true;
    dragHasCommittedRef.current = false;
    setSelectedRoomIndex(roomIndex);
  };

  const handleVertexPointerMove = (e: React.PointerEvent) => {
    const drag = vertexDragRef.current;
    if (!drag) return;
    e.stopPropagation();
    const cur = currentCustomRoom(drag.roomIndex);
    const local = pointerToLocalM(e, drag.group);
    if (!cur || !local) return;
    // Snapped in plan coordinates when the room isn't rotated, so corners line up with
    // everything else on the plan; in the room's own space when it is.
    const target = cur.rotation
      ? { x: nearestGridLine(local.x), y: nearestGridLine(local.y) }
      : { x: nearestGridLine(cur.origin.x + local.x) - cur.origin.x, y: nearestGridLine(cur.origin.y + local.y) - cur.origin.y };
    commitCustomEdit(drag.roomIndex, cur.points.map((p, k) => (k === drag.vertexIndex ? target : p)));
  };

  const handleVertexPointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    vertexDragRef.current = null;
    isDraggingRef.current = false;
  };

  const insertVertex = (roomIndex: number, afterIndex: number) => {
    const r = rooms[roomIndex];
    if (!r || !r.customPoints || r.customPoints.length >= MAX_POINTS) return;
    const a = r.customPoints[afterIndex];
    const b = r.customPoints[(afterIndex + 1) % r.customPoints.length];
    const before = unitToLocal(r.customPoints, parseFloat(r.widthM) || 0, parseFloat(r.lengthM) || 0);
    updateRoom(roomIndex, {
      // Wall numbers shift when a corner is added: doors and windows stay exactly where they were, on whichever half of the split wall holds them.
      exteriorDoors: r.exteriorDoors ? remapOpeningsAfterInsert(r.exteriorDoors, before, afterIndex) : undefined,
      windows: r.windows ? remapOpeningsAfterInsert(r.windows, before, afterIndex) : undefined,
      customWalls: undefined, // wall numbering shifts when a corner is added
      customPoints: [...r.customPoints.slice(0, afterIndex + 1), [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ...r.customPoints.slice(afterIndex + 1)],
    });
  };

  const deleteVertex = (roomIndex: number, vertexIndex: number) => {
    const cur = currentCustomRoom(roomIndex);
    if (!cur || cur.points.length <= 3) return;
    const r = rooms[roomIndex];
    // The two walls that met at this corner merge; doors and windows on them keep their place along the merged wall.
    const removed = commitCustomEdit(
      roomIndex,
      cur.points.filter((_, k) => k !== vertexIndex),
      true,
      {
        exteriorDoors: r?.exteriorDoors ? remapOpeningsAfterDelete(r.exteriorDoors, cur.points, vertexIndex) : undefined,
        windows: r?.windows ? remapOpeningsAfterDelete(r.windows, cur.points, vertexIndex) : undefined,
      }
    );
    // The numbering shifts when a corner goes, so the selection is cleared - but only if it really went. A
    // corner whose removal would collapse the room into a line, or make it cross itself, is refused, and the
    // person is told why instead of the button silently doing nothing.
    if (removed) {
      setSelectedVertex(null);
      setCornerMessage("");
    } else {
      setCornerMessage("That corner can't be removed - the room would collapse or cross itself.");
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drawMode) {
      updateDrawCursor(e);
      return;
    }
    if (measureMode && measureStart) {
      const point = getSvgPoint(e);
      if (point) setMeasureEnd(point);
      return;
    }
    if (!dragRef.current) return;
    const { roomIndex, lastClientX, lastClientY, rawX, rawY } = dragRef.current;
    const deltaXm = clientDeltaToMetres(e.clientX - lastClientX);
    const deltaYm = clientDeltaToMetres(e.clientY - lastClientY);
    // The delta always accumulates onto rawX/rawY, never onto the potentially-snapped
    // displayed position — this is what keeps the room's movement in sync with the mouse
    // even while snapping is actively pulling the displayed position to a nearby edge.
    const dragged = positioned.find((p) => p.i === roomIndex);
    const nextRawX = Math.max(minOrigin(dragged?.bboxMinX ?? 0), rawX + deltaXm);
    const nextRawY = Math.max(minOrigin(dragged?.bboxMinY ?? 0), rawY + deltaYm);
    dragRef.current = { roomIndex, lastClientX: e.clientX, lastClientY: e.clientY, rawX: nextRawX, rawY: nextRawY };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        const room = positioned.find((p) => p.i === roomIndex);
        const others = positioned.filter((p) => p.i !== roomIndex).map(snapBox);
        const mine = room ? snapBox(room) : { x: 0, y: 0, w: parseFloat(r.widthM) || 0, h: parseFloat(r.lengthM) || 0, dx: 0, dy: 0 };
        // Snapped by the visible box (for a rotated room that is not the position corner), then converted back.
        const snapped = snapPosition(nextRawX + mine.dx, nextRawY + mine.dy, mine.w, mine.h, others);
        return { ...r, xM: Math.max(minOrigin(mine.dx), snapped.x - mine.dx), yM: Math.max(minOrigin(mine.dy), snapped.y - mine.dy) };
      })
    );
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    // A finger that was aiming a new corner places it now, where it lifted.
    const touchDraw = touchDrawRef.current;
    if (e && touchDraw && touchDraw.id === e.pointerId) {
      touchDrawRef.current = null;
      if (drawMode) handleDrawPointerDown(e);
    }
    dragRef.current = null;
    vertexDragRef.current = null;
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
    const rawDeltaXm = clientDeltaToMetres(e.clientX - lastClientX);
    const rawDeltaYm = clientDeltaToMetres(e.clientY - lastClientY);
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
          const gridDist = Math.abs(clamped - nearestGridLine(clamped));
          const snapped = gridDist < GRID_THRESHOLD ? Math.max(minWidth, nearestGridLine(clamped)) : clamped;
          return { ...r, widthM: snapped.toFixed(2) };
        }
        const clamped = Math.max(minLength, Math.min(MAX_SIZE, nextRawValue));
        const gridDist = Math.abs(clamped - nearestGridLine(clamped));
        const snapped = gridDist < GRID_THRESHOLD ? Math.max(minLength, nearestGridLine(clamped)) : clamped;
        return { ...r, lengthM: snapped.toFixed(2) };
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
    const rawDeltaXm = clientDeltaToMetres(e.clientX - lastClientX);
    const rawDeltaYm = clientDeltaToMetres(e.clientY - lastClientY);
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
    const rawDeltaXm = clientDeltaToMetres(e.clientX - lastClientX);
    const rawDeltaYm = clientDeltaToMetres(e.clientY - lastClientY);
    exteriorDoorDragRef.current = { roomIndex, doorIndex, lastClientX: e.clientX, lastClientY: e.clientY };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        const doors = r.exteriorDoors || [];
        const existing = doors[doorIndex];
        if (!existing) return r;
        const rotationDeg = r.rotationDeg ? parseFloat(r.rotationDeg) : 0;
        const [deltaXm, deltaYm] = rotationDeg ? rotatePoint(rawDeltaXm, rawDeltaYm, 0, 0, -rotationDeg) : [rawDeltaXm, rawDeltaYm];
        const frame = existing.edgeIndex !== undefined ? roomEdgeFrame(r, existing.edgeIndex) : null;
        const wall = existing.wall;
        const span = frame ? frame.length : wall === "top" || wall === "bottom" ? parseFloat(r.widthM) || 0 : parseFloat(r.lengthM) || 0;
        const axisDelta = frame ? deltaXm * frame.dir.x + deltaYm * frame.dir.y : wall === "top" || wall === "bottom" ? deltaXm : deltaYm;
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
    const rawDeltaXm = clientDeltaToMetres(e.clientX - lastClientX);
    const rawDeltaYm = clientDeltaToMetres(e.clientY - lastClientY);
    windowDragRef.current = { roomIndex, windowIndex, lastClientX: e.clientX, lastClientY: e.clientY };

    updateRooms((rs) =>
      rs.map((r, i) => {
        if (i !== roomIndex) return r;
        const wins = r.windows || [];
        const existing = wins[windowIndex];
        if (!existing) return r;
        const rotationDeg = r.rotationDeg ? parseFloat(r.rotationDeg) : 0;
        const [deltaXm, deltaYm] = rotationDeg ? rotatePoint(rawDeltaXm, rawDeltaYm, 0, 0, -rotationDeg) : [rawDeltaXm, rawDeltaYm];
        const frame = existing.edgeIndex !== undefined ? roomEdgeFrame(r, existing.edgeIndex) : null;
        const wall = existing.wall;
        const span = frame ? frame.length : wall === "top" || wall === "bottom" ? parseFloat(r.widthM) || 0 : parseFloat(r.lengthM) || 0;
        const axisDelta = frame ? deltaXm * frame.dir.x + deltaYm * frame.dir.y : wall === "top" || wall === "bottom" ? deltaXm : deltaYm;
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

  // ---- Zoom, pan and multi-touch -----------------------------------------------------------------
  // The plan is zoomed by resizing the SVG itself (its viewBox never changes) inside the scrolling box that
  // already holds it - so scrolling IS panning, and every position and drag conversion keeps working, because
  // they all go through the SVG's own screen transform (see getSvgPoint, screenScale).
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const bindScroller = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    setScrollerEl(el);
  }, []);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;
  const renderedZoomRef = useRef(1); // the zoom the SVG on screen was last drawn at
  const zoomAnchorRef = useRef<{ contentX: number; contentY: number; screenX: number; screenY: number } | "reset" | null>(null);
  const touchPointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ startDist: number; startZoom: number; contentX: number; contentY: number } | null>(null);
  const gestureConsumedRef = useRef(false); // once two fingers have begun a gesture, a finger left down does nothing until every finger lifts
  const panRef = useRef<{ id: number; lastX: number; lastY: number } | null>(null);
  const spaceDownRef = useRef(false);
  const overCanvasRef = useRef(false);
  const modeRef = useRef({ draw: false });
  modeRef.current.draw = drawMode;

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

  // Scrolls so the anchored point of the plan sits under (screenX, screenY). The box around the plan only grows
  // as tall as the plan does, so up-and-down scrolling is usually the PAGE's job, not the box's: whatever the box
  // had no room to scroll, the page scrolls instead. (Sideways, the box does it all.)
  const placeAnchor = (a: { contentX: number; contentY: number; screenX: number; screenY: number }, atZoom: number) => {
    const scroller = scrollerRef.current;
    const svg = svgRef.current;
    if (!scroller || !svg) return;
    const rect = svg.getBoundingClientRect();
    const dx = rect.left + a.contentX * atZoom - a.screenX;
    const dy = rect.top + a.contentY * atZoom - a.screenY;
    const beforeY = scroller.scrollTop;
    scroller.scrollLeft += dx;
    scroller.scrollTop += dy;
    const leftoverY = dy - (scroller.scrollTop - beforeY);
    if (Math.abs(leftoverY) > 0.5 && typeof window !== "undefined") window.scrollBy(0, leftoverY);
  };
  // How big a touch target should be, in the plan's own units: a fixed size ON SCREEN, so it stays easy to hit
  // however far the plan is zoomed in or out. A finger needs about 44px; a mouse is happy with far less.
  const hitPx = (finePx: number, touchPx: number) => (coarse ? touchPx : finePx) / zoom;

  // Zooms to `next`, keeping the point of the plan under (clientX, clientY) - the cursor, the pinch centre, or
  // the middle of the view - exactly where it is on screen.
  const zoomTo = (next: number, clientX?: number, clientY?: number) => {
    const z = clampZoom(next);
    if (Math.abs(z - zoomRef.current) < 0.0001) return;
    const scroller = scrollerRef.current;
    const svg = svgRef.current;
    if (scroller && svg) {
      const box = scroller.getBoundingClientRect();
      const rect = svg.getBoundingClientRect();
      const sx = clientX ?? box.left + scroller.clientWidth / 2;
      const sy = clientY ?? box.top + scroller.clientHeight / 2;
      zoomAnchorRef.current = { contentX: (sx - rect.left) / renderedZoomRef.current, contentY: (sy - rect.top) / renderedZoomRef.current, screenX: sx, screenY: sy };
    }
    zoomRef.current = z;
    setZoom(z);
    setAnchorTick((t) => t + 1);
  };

  const fitToView = () => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const baseW = canvasWm * PIXELS_PER_METRE + 20;
    const baseH = canvasHm * PIXELS_PER_METRE + 20;
    const availW = scroller.clientWidth || baseW;
    const availH = Math.max(320, (typeof window !== "undefined" ? window.innerHeight : 800) - 280);
    const z = clampZoom(Math.min(availW / baseW, availH / baseH));
    zoomRef.current = z;
    zoomAnchorRef.current = "reset";
    setZoom(z);
    if (Math.abs(z - renderedZoomRef.current) < 0.0001) {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
      zoomAnchorRef.current = null;
    }
  };

  const fitRef = useRef(fitToView); // so the keyboard shortcut always fits the plan as it is NOW, not as it was when the listener was set up
  fitRef.current = fitToView;

  // After the SVG has been redrawn at its new size, scroll so the anchored point of the plan is back under
  // the finger or cursor it was under before.
  useLayoutEffect(() => {
    renderedZoomRef.current = zoom;
    const anchor = zoomAnchorRef.current;
    if (!anchor) return;
    zoomAnchorRef.current = null;
    const scroller = scrollerRef.current;
    const svg = svgRef.current;
    if (!scroller || !svg) return;
    if (anchor === "reset") {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
      return;
    }
    placeAnchor(anchor, zoom);
  }, [zoom, anchorTick]);

  // Ctrl/Cmd + wheel (and a trackpad pinch, which browsers report the same way) zooms around the cursor. A
  // plain wheel still scrolls as normal. Registered by hand because React's wheel handler is passive, and a
  // passive handler cannot stop the browser zooming the whole page.
  useEffect(() => {
    const el = scrollerEl;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY; // some browsers report lines, not pixels
      zoomTo(zoomRef.current * Math.exp(-dy * 0.0025), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [scrollerEl]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Keyboard, only while the pointer is over the plan - so Space still scrolls the page everywhere else, keys
  // still type in text boxes, and buttons still press:
  //   Space + drag pans         + / -  zoom in / out         0  back to 100%         F  fit the whole plan
  // (Ctrl/Cmd + plus/minus is left alone: that is the browser's own page zoom. And while drawing, number keys
  // type a wall length, so 0 does nothing there.)
  useEffect(() => {
    const typing = (t: EventTarget | null) => {
      const tag = (t as HTMLElement | null)?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON";
    };
    const down = (e: KeyboardEvent) => {
      if (!overCanvasRef.current || typing(e.target)) return;
      if (e.code === "Space") {
        spaceDownRef.current = true;
        e.preventDefault();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomTo(zoomRef.current * 1.25);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomTo(zoomRef.current / 1.25);
      } else if (e.key === "0" && !modeRef.current.draw) {
        e.preventDefault();
        zoomTo(1);
      } else if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        fitRef.current();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDownRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // The zoom is remembered for this property between visits, in this browser. (Not in the database: it is how
  // somebody likes to look at the plan, not part of the plan.) Wrapped in try/catch because some browsers - private
  // windows, locked-down ones - refuse storage altogether.
  const zoomStorageKey = `proptmate.floorplan.zoom.${propertyId}`;
  const zoomRestoredRef = useRef(false);
  const skipNextZoomSaveRef = useRef(false);
  useEffect(() => {
    try {
      const saved = parseFloat(window.localStorage.getItem(zoomStorageKey) || "");
      if (Number.isFinite(saved) && saved >= MIN_ZOOM && saved <= MAX_ZOOM) {
        skipNextZoomSaveRef.current = true; // this pass still has zoom at 1 - saving it now would wipe the value just read
        zoomRef.current = saved;
        setZoom(saved);
      }
    } catch {}
    zoomRestoredRef.current = true;
  }, [zoomStorageKey]);
  useEffect(() => {
    if (!zoomRestoredRef.current) return;
    if (skipNextZoomSaveRef.current) {
      skipNextZoomSaveRef.current = false;
      return;
    }
    try {
      if (Math.abs(zoom - 1) < 0.0001) window.localStorage.removeItem(zoomStorageKey);
      else window.localStorage.setItem(zoomStorageKey, String(Math.round(zoom * 1000) / 1000));
    } catch {}
  }, [zoom, zoomStorageKey]);

  // On a touch screen the browser decides, as soon as a finger starts to move, whether the gesture is a page scroll
  // - and the `touch-action: none` set on rooms and handles does NOT stop that in Chrome, which only honours it on
  // the outer <svg>. Left alone, dragging a room gets cancelled after about 20px as the browser takes over to
  // scroll. So: a touch that BEGINS on a room, handle, door or anything else drawn on the plan is claimed here
  // (its scrolling is cancelled so the drag carries on), while a touch that begins on empty background is left
  // alone and scrolls the page as normal. Two or more fingers are always ours: that is pinch and two-finger pan.
  useEffect(() => {
    const el = scrollerEl;
    if (!el) return;
    let claimed = false;
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      const svg = svgRef.current;
      claimed = e.touches.length >= 2 || (!!target && !!svg && target !== svg && svg.contains(target));
    };
    const onMove = (e: TouchEvent) => {
      if (claimed && e.cancelable) e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) claimed = false;
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [scrollerEl]);

  // Stops whatever single-pointer action is under way - a room being dragged, a handle being pulled, a
  // measurement, a corner being aimed - so a second finger arriving for a pinch cannot leave it half-done.
  const cancelInProgressDrags = () => {
    dragRef.current = null;
    resizeDragRef.current = null;
    fixtureDragRef.current = null;
    exteriorDoorDragRef.current = null;
    windowDragRef.current = null;
    vertexDragRef.current = null;
    touchDrawRef.current = null;
    isDraggingRef.current = false;
    setMeasureStart(null);
    setMeasureEnd(null);
  };

  // Everything below runs in the CAPTURE phase on the box around the plan, so it sees every pointer first and
  // can claim it (by stopping it) before a room, handle or corner does anything with it.
  const handleScrollerPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const scroller = e.currentTarget;
    const onBackground = e.target === svgRef.current;
    const plainMode = !drawMode && !measureMode;
    // Panning with a mouse or pen: middle button, Space + drag, or a plain drag on empty background. (A finger
    // on empty background scrolls the box natively.)
    const wantsPan =
      e.pointerType === "mouse"
        ? e.button === 1 || (e.button === 0 && (spaceDownRef.current || (onBackground && plainMode)))
        : e.pointerType === "pen"
          ? onBackground && plainMode
          : false;
    if (wantsPan) {
      e.preventDefault();
      e.stopPropagation();
      panRef.current = { id: e.pointerId, lastX: e.clientX, lastY: e.clientY };
      scroller.setPointerCapture?.(e.pointerId);
      return;
    }
    if (e.pointerType !== "touch") return;
    if (e.isPrimary) {
      // The first finger down: forget any pointer that went missing without lifting.
      touchPointersRef.current.clear();
      gestureRef.current = null;
      gestureConsumedRef.current = false;
    }
    touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gestureConsumedRef.current) {
      e.stopPropagation();
      return;
    }
    if (touchPointersRef.current.size === 2) {
      const [a, b] = [...touchPointersRef.current.values()];
      const rect = svgRef.current?.getBoundingClientRect();
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      gestureRef.current = {
        startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        startZoom: zoomRef.current,
        contentX: rect ? (midX - rect.left) / renderedZoomRef.current : 0,
        contentY: rect ? (midY - rect.top) / renderedZoomRef.current : 0,
      };
      gestureConsumedRef.current = true;
      cancelInProgressDrags();
      e.stopPropagation();
    }
  };

  const handleScrollerPointerMoveCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      e.currentTarget.scrollLeft -= e.clientX - pan.lastX;
      e.currentTarget.scrollTop -= e.clientY - pan.lastY;
      pan.lastX = e.clientX;
      pan.lastY = e.clientY;
      e.stopPropagation();
      return;
    }
    if (e.pointerType !== "touch") return;
    if (touchPointersRef.current.has(e.pointerId)) touchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gestureConsumedRef.current) return;
    e.stopPropagation();
    const g = gestureRef.current;
    const pts = [...touchPointersRef.current.values()];
    if (!g || pts.length < 2) return;
    const [a, b] = pts;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const z = clampZoom(g.startZoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.startDist));
    // The point of the plan that was between the fingers when they landed stays between them - which is both
    // the zoom and the pan of a two-finger gesture at once.
    const anchor = { contentX: g.contentX, contentY: g.contentY, screenX: midX, screenY: midY };
    if (Math.abs(z - zoomRef.current) > 0.0001) {
      zoomAnchorRef.current = anchor;
      zoomRef.current = z;
      setZoom(z);
      setAnchorTick((t) => t + 1);
    } else {
      placeAnchor(anchor, renderedZoomRef.current);
    }
  };

  const handleScrollerPointerEndCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (pan && pan.id === e.pointerId) {
      panRef.current = null;
      e.stopPropagation();
      return;
    }
    if (e.pointerType !== "touch") return;
    touchPointersRef.current.delete(e.pointerId);
    if (gestureConsumedRef.current) {
      e.stopPropagation();
      if (touchPointersRef.current.size < 2) gestureRef.current = null;
      if (touchPointersRef.current.size === 0) gestureConsumedRef.current = false;
    }
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
      // Editor-only overlays (the drawing grid, corner handles, an outline still being drawn)
      // must never end up in an exported image - work on a copy with them stripped out.
      const exportEl = svgEl.cloneNode(true) as SVGSVGElement;
      exportEl.querySelectorAll("[data-editor-only]").forEach((node) => node.remove());
      // The picture is always exported at the plan's own size, whatever zoom it is being viewed at: the
      // viewBox says how big the plan really is, while width/height are only how big it is on screen right now.
      const viewBox = (svgEl.getAttribute("viewBox") || "").split(/\s+/).map(Number);
      const baseWidth = viewBox[2] > 0 ? viewBox[2] : parseFloat(svgEl.getAttribute("width") || "0");
      const baseHeight = viewBox[3] > 0 ? viewBox[3] : parseFloat(svgEl.getAttribute("height") || "0");
      exportEl.setAttribute("width", String(baseWidth));
      exportEl.setAttribute("height", String(baseHeight));
      const serialized = new XMLSerializer().serializeToString(exportEl);
      const svgBlob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);

      const widthPx = baseWidth;
      const heightPx = baseHeight;
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
            } else if (r.shape === "custom" && r.customPoints && r.customPoints.length >= 3) {
              shapeParams = JSON.stringify({ points: r.customPoints });
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
              customWalls: r.customWalls && r.customWalls.length > 0 ? JSON.stringify(r.customWalls) : undefined,
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
        <button
          onClick={() => setShowDimensions((v) => !v)}
          title="Show or hide measurements on each room"
          className={`text-sm rounded-full px-3 py-1.5 transition-colors border ${
            showDimensions ? "text-signal border-signal bg-signal/10" : "text-ink border-line hover:border-signal"
          }`}
        >
          📏 Dimensions {showDimensions ? "on" : "off"}
        </button>
        <button
          onClick={() => setShowAreas((v) => !v)}
          title="Show or hide each room's floor area"
          className={`text-sm rounded-full px-3 py-1.5 transition-colors border ${
            showAreas ? "text-signal border-signal bg-signal/10" : "text-ink border-line hover:border-signal"
          }`}
        >
          ▦ Area {showAreas ? "on" : "off"}
        </button>
        <button
          onClick={() => setShowGrid((v) => !v)}
          title="Show or hide the measuring grid (1 m squares, with 0.5 m guides)"
          className={`text-sm rounded-full px-3 py-1.5 transition-colors border ${
            showGrid || drawMode ? "text-signal border-signal bg-signal/10" : "text-ink border-line hover:border-signal"
          }`}
        >
          ⌗ Grid {showGrid || drawMode ? "on" : "off"}
        </button>
        <button
          onClick={() => {
            stopDrawing();
            setMeasureMode((v) => !v);
            setMeasureStart(null);
            setMeasureEnd(null);
          }}
          title="Click two points anywhere on the plan to measure the real distance between them"
          className={`text-sm rounded-full px-3 py-1.5 transition-colors border ${
            measureMode ? "text-signal border-signal bg-signal/10" : "text-ink border-line hover:border-signal"
          }`}
        >
          📐 Measure {measureMode ? "on" : "off"}
        </button>
        <button
          onClick={() => (drawMode ? stopDrawing() : startDrawing())}
          title="Draw a room from scratch - click to place each corner, like sketching in CAD"
          className={`text-sm rounded-full px-3 py-1.5 transition-colors border font-medium ${
            drawMode ? "bg-signal text-white border-signal" : "text-signal border-signal hover:bg-signal/10"
          }`}
        >
          ✏️ Draw room {drawMode ? "on" : ""}
        </button>
        {drawMode && (
          <div className="basis-full rounded-2xl border border-signal/30 bg-signal/5 p-3 flex flex-wrap items-center gap-2 text-sm">
            <input
              value={drawName}
              onChange={(e) => setDrawName(e.target.value)}
              placeholder={`Room name (e.g. Kitchen) - or leave for "Room ${rooms.length + 1}"`}
              className="w-64 border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-signal"
            />
            <button
              type="button"
              onClick={cycleDrawMode}
              title="Angle lock. Ortho keeps walls straight up/down and left/right, 45° also allows diagonals, Free places corners anywhere on the grid. Hold Shift to temporarily switch. Press O to cycle."
              className="text-sm border border-line rounded-full px-3 py-1.5 bg-white hover:border-signal"
            >
              {drawAngleMode === "ortho" ? "⊥ Ortho" : drawAngleMode === "polar" ? "∠ 45°" : "✥ Free"}
            </button>
            <input
              ref={lengthInputRef}
              inputMode="decimal"
              value={typedLength}
              disabled={drawPoints.length === 0}
              onChange={(e) => setTypedLength(e.target.value.replace(/[^0-9.]/g, ""))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  placeTypedLength();
                }
              }}
              placeholder={drawPoints.length === 0 ? "Wall length (m)" : "Type length (m), then Enter"}
              title="Point the wall in the direction you want, type its exact length, and press Enter - like AutoCAD's dynamic input"
              className="w-48 border border-line rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-signal disabled:opacity-50"
            />
            <button type="button" onClick={undoDrawPoint} disabled={drawPoints.length === 0} className="text-sm border border-line rounded-full px-3 py-1.5 bg-white hover:border-signal disabled:opacity-40">
              ↶ Undo corner
            </button>
            <button type="button" onClick={finishDrawing} disabled={drawPoints.length < 3} className="text-sm rounded-full px-3 py-1.5 bg-verified text-white disabled:opacity-40">
              ✓ Close shape
            </button>
            <button
              type="button"
              onClick={() => {
                setDrawPoints([]);
                setDrawCursor(null);
                setTypedLength("");
                setDrawMessage("");
              }}
              disabled={drawPoints.length === 0}
              className="text-sm border border-line rounded-full px-3 py-1.5 bg-white hover:border-red-400 disabled:opacity-40"
            >
              Clear
            </button>
            <button type="button" onClick={stopDrawing} className="text-sm border border-line rounded-full px-3 py-1.5 bg-white hover:border-ink">
              Done
            </button>
            <div className="basis-full text-xs text-slate">
              {(() => {
                const last = drawPoints[drawPoints.length - 1];
                const seg = last && drawCursor ? Math.hypot(drawCursor.p.x - last.x, drawCursor.p.y - last.y) : 0;
                const area = drawPoints.length >= 3 ? polygonArea(drawPoints) : null;
                return (
                  <>
                    {drawPoints.length === 0 ? "Click on the plan to place the first corner." : `${drawPoints.length} corner${drawPoints.length === 1 ? "" : "s"} placed`}
                    {seg > 0.001 && last && drawCursor ? ` · wall ${seg.toFixed(2)} m at ${lineAngleDeg(last, drawCursor.p).toFixed(0)}°` : ""}
                    {area !== null ? ` · area ${area.toFixed(1)} m²` : ""}
                    {" — click the first corner, double-click, or press Enter to close · Backspace removes the last corner · hold Shift for a free angle · O cycles Ortho / 45° / Free · Esc cancels"}
                  </>
                );
              })()}
            </div>
            {drawMessage && <div className="basis-full text-xs font-medium text-signal">{drawMessage}</div>}
          </div>
        )}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
        <div className="bg-white border border-line rounded-xl p-6 min-w-0">
          <h2 className="font-display font-600 text-ink mb-1">Rooms on this floor</h2>
          <p className="text-sm text-slate mb-4">Enter each room's name, dimensions, and shape — the layout on the right updates automatically, and you can drag rooms there to rearrange them.</p>

          <div className="space-y-4">
            {rooms.map((room, i) => (
              <div key={i} className="border border-line rounded-lg p-3">
                <div className="flex items-center gap-2 flex-wrap gap-y-2">
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

                <div className="flex items-center gap-2 mt-2 flex-wrap gap-y-2">
                  <label className="text-xs text-slate shrink-0">Position</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="50"
                    placeholder="X (m)"
                    value={room.xM === undefined ? "" : roundCm(room.xM + outlineOffset(i).x)}
                    onChange={(e) => updateRoom(i, { xM: e.target.value === "" ? undefined : Math.min(50, Math.max(0, parseFloat(e.target.value) || 0)) - outlineOffset(i).x })}
                    title="Exact horizontal position from the left edge - typed here is used exactly as entered, never rounded to the drag grid"
                    className="w-20 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <span className="text-slate text-xs">,</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="50"
                    placeholder="Y (m)"
                    value={room.yM === undefined ? "" : roundCm(room.yM + outlineOffset(i).y)}
                    onChange={(e) => updateRoom(i, { yM: e.target.value === "" ? undefined : Math.min(50, Math.max(0, parseFloat(e.target.value) || 0)) - outlineOffset(i).y })}
                    title="Exact vertical position from the top edge - typed here is used exactly as entered, never rounded to the drag grid"
                    className="w-20 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <span className="text-xs text-slate">Distance from the top-left corner - unlike dragging, typed here isn't rounded to the grid</span>
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
                          ? { shape: newShape, customWalls: undefined, customPoints: undefined, ...clearHasBayWindow }
                          : {
                              shape: newShape,
                              customWalls: undefined,
                              customPoints: undefined,
                              isStairs: false,
                              stairDirection: undefined,
                              stairLinkFloor: undefined,
                              stairLinkRoom: undefined,
                              ...clearHasBayWindow,
                            }
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
                    {room.shape === "custom" && <option value="custom">Hand-drawn outline</option>}
                  </select>
                  {room.shape === "custom" && (
                    <span className="text-xs text-slate">
                      Hand-drawn · {room.customPoints?.length ?? 0} corners · select this room on the plan to drag its corners, click a ◆ to add one, double-click a corner to remove it
                    </span>
                  )}

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

                  {room.shape !== "bay-window" && room.shape !== "custom" && (
                    <>
                      <label className="flex items-center gap-1.5 text-xs text-slate shrink-0" title="Adds a bay window on top of whatever shape is selected above - for a room that has both, like an L-shaped room with a bay window on one of its straight walls">
                        <input
                          type="checkbox"
                          checked={!!room.hasBayWindow}
                          onChange={(e) => updateRoom(i, { hasBayWindow: e.target.checked, customWalls: undefined })}
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

                <div className="mt-2 space-y-2">
                  {(() => {
                    // The room's own edge count, BEFORE any custom walls are applied - what
                    // the wall-picker dropdown offers, so it only ever shows genuinely valid
                    // choices for this room's actual current shape, never a stale or
                    // out-of-range index left over from before the shape itself was changed.
                    const baseGeometry = roomGeometry({
                      widthM: parseFloat(room.widthM) || 0,
                      lengthM: parseFloat(room.lengthM) || 0,
                      shape: room.shape,
                      bayWidthM: room.bayWidthM ? parseFloat(room.bayWidthM) : undefined,
                      bayDepthM: room.bayDepthM ? parseFloat(room.bayDepthM) : undefined,
                      notchWidthM: room.notchWidthM ? parseFloat(room.notchWidthM) : undefined,
                      notchDepthM: room.notchDepthM ? parseFloat(room.notchDepthM) : undefined,
                      notchCorner: room.notchCorner,
                      angledCutWidthM: room.angledCutWidthM ? parseFloat(room.angledCutWidthM) : undefined,
                      angledCutDepthM: room.angledCutDepthM ? parseFloat(room.angledCutDepthM) : undefined,
                      angledCorner: room.angledCorner,
                      trapezoidTopWidthM: room.trapezoidTopWidthM ? parseFloat(room.trapezoidTopWidthM) : undefined,
                      trapezoidSide: room.trapezoidSide,
                      slopedTopAmountM: room.slopedTopAmountM ? parseFloat(room.slopedTopAmountM) : undefined,
                      slopedTopSide: room.slopedTopSide,
                      hasBayWindow: room.hasBayWindow,
                      customPoints: room.customPoints,
                    });
                    const edgeCount = baseGeometry.points.length;
                    const customWalls = room.customWalls || [];

                    const updateCustomWall = (idx: number, patch: Partial<NonNullable<Room["customWalls"]>[number]>) => {
                      const next = customWalls.map((w, wi) => (wi === idx ? { ...w, ...patch } : w));
                      updateRoom(i, { customWalls: next });
                    };
                    const removeCustomWall = (idx: number) => {
                      updateRoom(i, { customWalls: customWalls.filter((_, wi) => wi !== idx) });
                    };
                    const addCustomWall = () => {
                      const usedEdges = new Set(customWalls.map((w) => w.edgeIndex));
                      const firstFreeEdge = Array.from({ length: edgeCount }, (_, e) => e).find((e) => !usedEdges.has(e)) ?? 0;
                      updateRoom(i, { customWalls: [...customWalls, { edgeIndex: firstFreeEdge, style: "zigzag", zigzagCount: 3, zigzagDepthM: 0.2 }] });
                    };

                    return (
                      <>
                        {customWalls.map((wall, wi) => (
                          <div key={wi} className="flex items-center gap-2 flex-wrap bg-paper rounded-lg p-2">
                            <select
                              value={wall.edgeIndex}
                              onChange={(e) => updateCustomWall(wi, { edgeIndex: parseInt(e.target.value, 10) })}
                              className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                            >
                              {Array.from({ length: edgeCount }, (_, e) => e)
                                .filter((e) => e === wall.edgeIndex || !customWalls.some((other, oi) => oi !== wi && other.edgeIndex === e))
                                .map((e) => (
                                  <option key={e} value={e}>
                                    Wall {e + 1}
                                  </option>
                                ))}
                            </select>
                            <select
                              value={wall.style}
                              onChange={(e) => updateCustomWall(wi, { style: e.target.value as "zigzag" | "alcove" })}
                              className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                            >
                              <option value="zigzag">Zigzag</option>
                              <option value="alcove">Alcove / recess</option>
                            </select>
                            {wall.style === "zigzag" ? (
                              <>
                                <input
                                  type="number"
                                  min="1"
                                  max="20"
                                  step="1"
                                  placeholder="Teeth"
                                  value={wall.zigzagCount ?? ""}
                                  onChange={(e) => updateCustomWall(wi, { zigzagCount: parseInt(e.target.value, 10) || undefined })}
                                  className="w-20 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.05"
                                  placeholder="Depth (m)"
                                  value={wall.zigzagDepthM ?? ""}
                                  onChange={(e) => updateCustomWall(wi, { zigzagDepthM: parseFloat(e.target.value) || undefined })}
                                  className="w-24 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                                />
                              </>
                            ) : (
                              <>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  placeholder="Offset (m)"
                                  value={wall.alcoveOffsetM ?? ""}
                                  onChange={(e) => updateCustomWall(wi, { alcoveOffsetM: parseFloat(e.target.value) || undefined })}
                                  className="w-24 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.1"
                                  placeholder="Width (m)"
                                  value={wall.alcoveWidthM ?? ""}
                                  onChange={(e) => updateCustomWall(wi, { alcoveWidthM: parseFloat(e.target.value) || undefined })}
                                  className="w-24 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  step="0.05"
                                  placeholder="Depth (m)"
                                  value={wall.alcoveDepthM ?? ""}
                                  onChange={(e) => updateCustomWall(wi, { alcoveDepthM: parseFloat(e.target.value) || undefined })}
                                  className="w-24 border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                                />
                              </>
                            )}
                            <button type="button" onClick={() => removeCustomWall(wi)} className="text-slate hover:text-red-600 text-xs px-1" title="Remove">
                              ✕
                            </button>
                          </div>
                        ))}
                        {customWalls.length < edgeCount && (
                          <button type="button" onClick={addCustomWall} className="text-xs text-signal hover:underline">
                            + Customize a wall
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>

                {room.shape === "rectangle" && (
                  <div className="mt-2">
                    <div className="flex items-center gap-2 flex-wrap gap-y-2">
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
                          {room.shape === "custom" && (
                            <select
                              value={door.edgeIndex ?? 0}
                              onChange={(e) => {
                                const idx = parseInt(e.target.value, 10);
                                const len = customWallChoices(room)[idx]?.length ?? 0;
                                updateRoom(i, { exteriorDoors: (room.exteriorDoors || []).map((d, i2) => (i2 === di ? { ...d, wall: "top" as const, edgeIndex: idx, positionM: len / 2 } : d)) });
                              }}
                              title="Which wall of the hand-drawn outline this door is in (the numbers show on the plan when the room is selected)"
                              className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                            >
                              {customWallChoices(room).map((c) => (
                                <option key={c.index} value={c.index}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          )}
                          {room.shape !== "custom" && (
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
                          )}
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
                          const lw = room.shape === "custom" ? longestWall(room) : null;
                          updateRoom(i, {
                            exteriorDoors: [
                              ...(room.exteriorDoors || []),
                              lw ? { label: "", wall: "top" as const, edgeIndex: lw.index, positionM: lw.length / 2 } : { label: "", wall: "top" as const, positionM: widthNum / 2 },
                            ],
                          });
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
                      <div key={wi} className="flex items-center gap-2 flex-wrap gap-y-2">
                        {room.shape === "custom" && (
                          <select
                            value={win.edgeIndex ?? 0}
                            onChange={(e) => {
                              const idx = parseInt(e.target.value, 10);
                              const len = customWallChoices(room)[idx]?.length ?? 0;
                              updateRoom(i, { windows: (room.windows || []).map((w, i2) => (i2 === wi ? { wall: "top" as const, edgeIndex: idx, positionM: len / 2 } : w)) });
                            }}
                            title="Which wall of the hand-drawn outline this window is in (the numbers show on the plan when the room is selected)"
                            className="border border-line rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-signal"
                          >
                            {customWallChoices(room).map((c) => (
                              <option key={c.index} value={c.index}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        )}
                        {room.shape !== "custom" && (
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
                        )}
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
                          const lw = room.shape === "custom" ? longestWall(room) : null;
                          updateRoom(i, {
                            windows: [...(room.windows || []), lw ? { wall: "top" as const, edgeIndex: lw.index, positionM: lw.length / 2 } : { wall: "top" as const, positionM: widthNum / 2 }],
                          });
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
                            <label key={kind} className="flex items-center gap-1 text-xs text-ink flex-wrap gap-y-2">
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
                                    <div key={t.type} className="flex items-center gap-1 flex-wrap gap-y-2">
                                      <label className="flex items-center gap-1 text-xs text-ink flex-wrap gap-y-2">
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
                          <div key={oi} className="flex items-center gap-1 text-xs text-ink flex-wrap gap-y-2">
                            <label className="flex items-center gap-1 flex-wrap gap-y-2">
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

          <div className="flex items-center gap-3 mt-4 flex-wrap gap-y-2">
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

          <div className="flex items-center gap-3 mt-6 flex-wrap gap-y-2">
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

        <div className="bg-white border border-line rounded-xl p-6 min-w-0">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-y-2">
            <h2 className="font-display font-600 text-ink">Layout preview — {levels[activeLevel]?.name}</h2>
            <div className="flex items-center gap-3 flex-wrap gap-y-2">
              {totalAreaM2 > 0 && <span className="text-xs text-slate">{formatAreaBoth(totalAreaM2)} total</span>}
              {(positioned.length > 0 || drawMode) && (
                <div className="flex items-center gap-1 flex-wrap gap-y-2" role="group" aria-label="Zoom">
                  <button
                    type="button"
                    onClick={() => zoomTo(zoomRef.current / 1.25)}
                    disabled={zoom <= MIN_ZOOM + 0.0001}
                    aria-label="Zoom out"
                    title="Zoom out (−, or hold Ctrl/⌘ and scroll, or pinch)"
                    className={`${coarse ? "w-10 h-10" : "w-7 h-7"} rounded-full border border-line text-ink hover:border-signal disabled:opacity-40 transition-colors`}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomTo(1)}
                    aria-label="Reset zoom to 100%"
                    title="Back to 100% (0)"
                    className={`${coarse ? "h-10" : "h-7"} min-w-[3.25rem] px-2 rounded-full border border-line text-xs text-ink hover:border-signal transition-colors`}
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={() => zoomTo(zoomRef.current * 1.25)}
                    disabled={zoom >= MAX_ZOOM - 0.0001}
                    aria-label="Zoom in"
                    title="Zoom in (+, or hold Ctrl/⌘ and scroll, or pinch)"
                    className={`${coarse ? "w-10 h-10" : "w-7 h-7"} rounded-full border border-line text-ink hover:border-signal disabled:opacity-40 transition-colors`}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={fitToView}
                    aria-label="Fit the whole plan in view"
                    title="Fit the whole plan in view (F)"
                    className={`${coarse ? "h-10" : "h-7"} px-3 rounded-full border border-line text-xs text-ink hover:border-signal transition-colors`}
                  >
                    Fit
                  </button>
                </div>
              )}
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
                  disabled={exporting || resizeMode || drawMode}
                  title={resizeMode ? "Turn off resize mode first, so the handles aren't included in the exported image" : drawMode ? "Press Done to finish drawing first" : undefined}
                  className="text-xs px-3 py-1.5 rounded-full border border-line text-ink hover:border-signal transition-colors disabled:opacity-50"
                >
                  {exporting ? "Exporting…" : "⬇ Export image"}
                </button>
              )}
            </div>
          </div>

          {positioned.length === 0 && !drawMode ? (
            <p className="text-sm text-slate">Add at least one room to see a preview - or press ✏️ Draw room above to sketch one from scratch.</p>
          ) : (
            <div className="relative">
                {selectedVertex && (() => {
                  const r = rooms[selectedVertex.roomIndex];
                  const count = r?.shape === "custom" ? r.customPoints?.length ?? 0 : 0;
                  if (!r || count === 0 || drawMode) return null;
                  return (
                    <div className="absolute left-2 right-2 bottom-2 z-10 flex items-center gap-2 flex-wrap text-xs bg-white/95 border border-line rounded-lg shadow-sm px-3 py-2" data-testid="corner-bar">
                      <span className="text-slate">
                        Corner {selectedVertex.vertexIndex + 1} of {r.name.trim() || "this room"} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteVertex(selectedVertex.roomIndex, selectedVertex.vertexIndex)}
                        disabled={count <= 3}
                        title={count <= 3 ? "A room needs at least three corners" : "Remove this corner - its two walls become one"}
                        className="px-3 py-1.5 rounded-full border border-line text-ink hover:border-red-600 hover:text-red-600 disabled:opacity-40 transition-colors"
                      >
                        Delete corner
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedVertex(null);
                          setCornerMessage("");
                        }}
                        className="px-3 py-1.5 rounded-full border border-line text-slate hover:border-signal transition-colors"
                      >
                        Done
                      </button>
                      {cornerMessage && (
                        <span className="text-red-600" role="alert" data-testid="corner-message">
                          {cornerMessage}
                        </span>
                      )}
                    </div>
                  );
                })()}
            <div
              ref={bindScroller}
              className="overflow-auto border border-line rounded-lg bg-paper"
              // One finger on empty background scrolls the box natively; everything else (pinch, two-finger pan)
              // is handled below, so the browser must not also try to zoom the whole page.
              style={{ touchAction: "pan-x pan-y" }}
              onPointerEnter={() => {
                overCanvasRef.current = true;
              }}
              onPointerLeave={() => {
                overCanvasRef.current = false;
              }}
              onPointerDownCapture={handleScrollerPointerDownCapture}
              onPointerMoveCapture={handleScrollerPointerMoveCapture}
              onPointerUpCapture={handleScrollerPointerEndCapture}
              onPointerCancelCapture={handleScrollerPointerEndCapture}
            >
              <svg
                ref={svgRef}
                width={(canvasWm * PIXELS_PER_METRE + 20) * zoom}
                height={(canvasHm * PIXELS_PER_METRE + 20) * zoom}
                viewBox={`0 0 ${canvasWm * PIXELS_PER_METRE + 20} ${canvasHm * PIXELS_PER_METRE + 20}`}
                onPointerDown={handleSvgPointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={() => cancelInProgressDrags()}
                onDoubleClick={handleSvgDoubleClick}
                style={{
                  cursor: measureMode || drawMode ? "crosshair" : undefined,
                  touchAction: measureMode || drawMode ? "none" : undefined,
                  userSelect: "none",
                  WebkitUserSelect: "none",
                  WebkitTouchCallout: "none",
                }}
              >
                {(drawMode || showGrid) && (
                  <g data-editor-only="true" className="pointer-events-none">
                    <rect x={10} y={10} width={canvasWm * PIXELS_PER_METRE} height={canvasHm * PIXELS_PER_METRE} fill="url(#floorGridMinor)" />
                    <rect x={10} y={10} width={canvasWm * PIXELS_PER_METRE} height={canvasHm * PIXELS_PER_METRE} fill="url(#floorGridMajor)" />
                    <rect x={10} y={10} width={canvasWm * PIXELS_PER_METRE} height={canvasHm * PIXELS_PER_METRE} fill="none" stroke="#25344A" strokeOpacity={0.2} />
                  </g>
                )}
                <defs>
                  <pattern id="floorGridMinor" width={PIXELS_PER_METRE / 2} height={PIXELS_PER_METRE / 2} patternUnits="userSpaceOnUse" x={10} y={10}>
                    <path d={`M ${PIXELS_PER_METRE / 2} 0 L 0 0 L 0 ${PIXELS_PER_METRE / 2}`} fill="none" stroke="#E9E3D9" strokeWidth={0.6} />
                  </pattern>
                  <pattern id="floorGridMajor" width={PIXELS_PER_METRE} height={PIXELS_PER_METRE} patternUnits="userSpaceOnUse" x={10} y={10}>
                    <path d={`M ${PIXELS_PER_METRE} 0 L 0 0 L 0 ${PIXELS_PER_METRE}`} fill="none" stroke="#D3CABB" strokeWidth={0.9} />
                  </pattern>
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
                  <g key={li} data-connection-line="true">
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
                  // On a hand-drawn room an opening sits on a real wall: it is drawn in a frame lying along
                  // that wall (x along the wall, y into the room) - exactly a "top wall" opening, rotated
                  // onto the wall. A stale wall number falls back to the old bounding-box placement.
                  const frameFor = (edgeIndex: number | undefined) => (roomData && edgeIndex !== undefined ? roomEdgeFrame(roomData, edgeIndex) : null);
                  const frameTransform = (f: EdgeFrame | null) => (f ? `translate(${f.a.x * PIXELS_PER_METRE}, ${f.a.y * PIXELS_PER_METRE}) rotate(${f.angleDeg})` : undefined);
                  const exteriorDoorsForRoom = (roomData?.exteriorDoors || []).map((d, di) => {
                    const frame = frameFor(d.edgeIndex);
                    return frame
                      ? { ...d, wall: "top" as const, index: di, frame, gap: exteriorDoorGap("top", d.positionM, frame.length, 0) }
                      : { ...d, index: di, frame: null, gap: exteriorDoorGap(d.wall, d.positionM, room.widthM, room.lengthM) };
                  });
                  const windowsForRoom = (roomData?.windows || []).map((w, wi) => {
                    const frame = frameFor(w.edgeIndex);
                    return frame
                      ? { ...w, wall: "top" as const, index: wi, frame, gap: windowGap("top", w.positionM, frame.length, 0) }
                      : { ...w, index: wi, frame: null, gap: windowGap(w.wall, w.positionM, room.widthM, room.lengthM) };
                  });

                  return (
                    <g
                      key={room.i}
                      data-room={room.i}
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
                      {showDimensions && (
                        <g className="pointer-events-none" opacity={0.75}>
                          {/* Width, along the top edge */}
                          <line x1={0} y1={-12} x2={room.widthM * PIXELS_PER_METRE} y2={-12} stroke="#25344A" strokeWidth={1} />
                          <line x1={0} y1={-16} x2={0} y2={-8} stroke="#25344A" strokeWidth={1} />
                          <line x1={room.widthM * PIXELS_PER_METRE} y1={-16} x2={room.widthM * PIXELS_PER_METRE} y2={-8} stroke="#25344A" strokeWidth={1} />
                          <text x={(room.widthM * PIXELS_PER_METRE) / 2} y={-16} textAnchor="middle" fontSize={11} fill="#25344A">
                            {room.widthM.toFixed(2)}m
                          </text>
                          {/* Length, along the left edge */}
                          <line x1={-12} y1={0} x2={-12} y2={room.lengthM * PIXELS_PER_METRE} stroke="#25344A" strokeWidth={1} />
                          <line x1={-16} y1={0} x2={-8} y2={0} stroke="#25344A" strokeWidth={1} />
                          <line x1={-16} y1={room.lengthM * PIXELS_PER_METRE} x2={-8} y2={room.lengthM * PIXELS_PER_METRE} stroke="#25344A" strokeWidth={1} />
                          <text
                            x={-16}
                            y={(room.lengthM * PIXELS_PER_METRE) / 2}
                            textAnchor="middle"
                            fontSize={11}
                            fill="#25344A"
                            transform={`rotate(-90, -16, ${(room.lengthM * PIXELS_PER_METRE) / 2})`}
                          >
                            {room.lengthM.toFixed(2)}m
                          </text>
                        </g>
                      )}
                      {(() => {
                        // Corner handles for a selected hand-drawn room: drag a corner to move it, click a
                        // diamond on a wall to add a corner there, double-click a corner to remove it.
                        const pts = room.customPoints;
                        if (room.shape !== "custom" || !pts || selectedRoomIndex !== room.i || drawMode || measureMode) return null;
                        const px = (u: number) => u * room.widthM * PIXELS_PER_METRE;
                        const py = (v: number) => v * room.lengthM * PIXELS_PER_METRE;
                        return (
                          <g data-editor-only="true">
                            {pts.map(([u, v], k) => {
                              // The wall numbers the door / window controls refer to, set just inside each wall.
                              const [u2, v2] = pts[(k + 1) % pts.length];
                              const ax = px(u), ay = py(v), bx = px(u2), by = py(v2);
                              const len = Math.hypot(bx - ax, by - ay);
                              if (len < 30) return null;
                              const dx = (bx - ax) / len, dy = (by - ay) / len;
                              return (
                                <text key={`wall-${k}`} x={ax + dx * len * 0.3 - dy * 12} y={ay + dy * len * 0.3 + dx * 12} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill="#D96B44" className="pointer-events-none">
                                  {k + 1}
                                </text>
                              );
                            })}
                            {pts.map(([u, v], k) => {
                              const [u2, v2] = pts[(k + 1) % pts.length];
                              const mx = px((u + u2) / 2);
                              const my = py((v + v2) / 2);
                              return (
                                <g key={`mid-${k}`}>
                                  <polygon
                                    points={`${mx},${my - 5} ${mx + 5},${my} ${mx},${my + 5} ${mx - 5},${my}`}
                                    fill="#D96B44"
                                    fillOpacity={0.6}
                                    stroke="#FBF8F4"
                                    strokeWidth={1}
                                    pointerEvents="none"
                                  />
                                  {/* Adds a corner on a tap or click - not the instant a finger touches down, which would add one by accident when starting to pinch or scroll. */}
                                  <circle
                                    data-mid-hit={k}
                                    cx={mx}
                                    cy={my}
                                    r={hitPx(8, 16)}
                                    fill="transparent"
                                    style={{ cursor: "copy", touchAction: "none" }}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      insertVertex(room.i, k);
                                    }}
                                  />
                                </g>
                              );
                            })}
                            {pts.map(([u, v], k) => {
                              const isSelected = selectedVertex?.roomIndex === room.i && selectedVertex.vertexIndex === k;
                              return (
                                <g key={`vertex-${k}`}>
                                  <circle cx={px(u)} cy={py(v)} r={isSelected ? 7.5 : 6} fill={isSelected ? "#D96B44" : "#FBF8F4"} stroke="#D96B44" strokeWidth={2} pointerEvents="none" />
                                  {/* The part you grab: invisible, and a fixed size ON SCREEN (bigger for a finger), however far the plan is zoomed. */}
                                  <circle
                                    data-vertex-hit={k}
                                    cx={px(u)}
                                    cy={py(v)}
                                    r={hitPx(9, 20)}
                                    fill="transparent"
                                    style={{ cursor: "move", touchAction: "none" }}
                                    onPointerDown={(e) => handleVertexPointerDown(e, room.i, k)}
                                    onPointerMove={handleVertexPointerMove}
                                    onPointerUp={handleVertexPointerUp}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      // A finger's double-tap has already deleted it - some browsers report a double-click as well.
                                      if (Date.now() - lastTouchDeleteRef.current < 700) return;
                                      deleteVertex(room.i, k);
                                    }}
                                  />
                                </g>
                              );
                            })}
                          </g>
                        );
                      })()}
                      {resizeMode && (
                        <>
                          <circle cx={room.widthM * PIXELS_PER_METRE} cy={(room.lengthM * PIXELS_PER_METRE) / 2} r={5} fill="#FBF8F4" stroke="#25344A" strokeWidth="1.5" pointerEvents="none" />
                          <circle
                            data-resize-hit="width"
                            cx={room.widthM * PIXELS_PER_METRE}
                            cy={(room.lengthM * PIXELS_PER_METRE) / 2}
                            r={hitPx(9, 22)}
                            fill="transparent"
                            style={{ cursor: "ew-resize", touchAction: "none" }}
                            onPointerDown={(e) => handleResizePointerDown(e, room.i, "width", room.widthM, room.rotationDeg || 0)}
                            onPointerMove={handleResizePointerMove}
                            onPointerUp={handleResizePointerUp}
                          />
                          <circle cx={(room.widthM * PIXELS_PER_METRE) / 2} cy={room.lengthM * PIXELS_PER_METRE} r={5} fill="#FBF8F4" stroke="#25344A" strokeWidth="1.5" pointerEvents="none" />
                          <circle
                            data-resize-hit="length"
                            cx={(room.widthM * PIXELS_PER_METRE) / 2}
                            cy={room.lengthM * PIXELS_PER_METRE}
                            r={hitPx(9, 22)}
                            fill="transparent"
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
                            transform={frameTransform(door.frame)}
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
                            <text x={labelX} y={labelY} fontSize="9" fill="#6B6A63" textAnchor={door.wall === "left" || door.wall === "right" ? "start" : "middle"} transform={door.frame ? `rotate(${-door.frame.angleDeg}, ${labelX}, ${labelY})` : undefined}>
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
                            transform={frameTransform(win.frame)}
                            onPointerDown={(e) => handleWindowPointerDown(e, room.i, win.index)}
                            onPointerMove={handleWindowPointerMove}
                            onPointerUp={handleWindowPointerUp}
                            style={{ cursor: "grab", touchAction: "none" }}
                          >
                            {horizontal ? (
                              <>
                                <rect x={gapStartPx} y={wallPx - hitPx(8, 17)} width={gapWidthPx} height={hitPx(16, 34)} fill="transparent" />
                                <rect x={gapStartPx} y={wallPx - 3} width={gapWidthPx} height={6} fill="#FBF8F4" />
                                <line x1={gapStartPx} y1={wallPx - 1.5} x2={gapEndPx} y2={wallPx - 1.5} stroke="#5B8AA6" strokeWidth="1" />
                                <line x1={gapStartPx} y1={wallPx + 1.5} x2={gapEndPx} y2={wallPx + 1.5} stroke="#5B8AA6" strokeWidth="1" />
                              </>
                            ) : (
                              <>
                                <rect x={wallPx - hitPx(8, 17)} y={gapStartPx} width={hitPx(16, 34)} height={gapWidthPx} fill="transparent" />
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
                        const [centroidXm, centroidYm] = room.shape === "custom" ? visualCenter(room.geometry.points) : polygonCentroid(room.geometry.points);
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
                            {showAreas && (
                              <text x={centerX} y={centerY + 24} textAnchor="middle" fontSize={Math.min(10, layout.fontSize)} fill="#25344A" opacity={0.6} transform={transform} className="pointer-events-none">
                                {polygonAreaM2(room.geometry.points).toFixed(1)}m²
                              </text>
                            )}
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
                    <g key={di} data-door="straight">
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
                {angledDoors.map((d, di) => {
                  const wPx = d.width * PIXELS_PER_METRE;
                  const hingeX = d.hingeAtStart ? 0 : wPx;
                  const closedX = d.hingeAtStart ? wPx : 0;
                  const openY = d.swingIntoPositive ? wPx : -wPx;
                  // Same handedness rule as a horizontal door: the frame is a pure rotation, so the arc's direction carries over unchanged.
                  const sweep = d.swingIntoPositive !== d.hingeAtStart ? 1 : 0;
                  return (
                    <g key={`angled-door-${di}`} data-door="angled" transform={`translate(${10 + d.x * PIXELS_PER_METRE}, ${10 + d.y * PIXELS_PER_METRE}) rotate(${d.angleDeg})`}>
                      <rect x={0} y={-3} width={wPx} height={6} fill="#FBF8F4" />
                      <line x1={hingeX} y1={0} x2={hingeX} y2={openY} stroke="#8B7355" strokeWidth="1" />
                      <path d={`M ${closedX} 0 A ${wPx} ${wPx} 0 0 ${sweep} ${hingeX} ${openY}`} fill="none" stroke="#8B7355" strokeWidth="1" />
                    </g>
                  );
                })}
                {drawMode && (
                  <g data-editor-only="true" className="pointer-events-none">
                    {(() => {
                      const toPx = (p: Pt) => ({ x: 10 + p.x * PIXELS_PER_METRE, y: 10 + p.y * PIXELS_PER_METRE });
                      const placed = drawPoints.map(toPx);
                      const cur = drawCursor ? toPx(drawCursor.p) : null;
                      const closing = drawCursor?.kind === "close";
                      const lastPx = placed[placed.length - 1];
                      const previewWorld = drawCursor && !closing ? [...drawPoints, drawCursor.p] : drawPoints;
                      const previewPx = previewWorld.map(toPx);
                      const halo = { stroke: "#FBF8F4", strokeWidth: 3, paintOrder: "stroke" } as const;
                      const cx = previewPx.length ? previewPx.reduce((s, p) => s + p.x, 0) / previewPx.length : 0;
                      const cy = previewPx.length ? previewPx.reduce((s, p) => s + p.y, 0) / previewPx.length : 0;
                      return (
                        <>
                          {previewPx.length >= 3 && <polygon points={previewPx.map((p) => `${p.x},${p.y}`).join(" ")} fill="#D96B44" fillOpacity={0.09} />}
                          {placed.length >= 2 && (
                            <polyline points={placed.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="#25344A" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                          )}
                          {drawPoints.slice(1).map((p, i) => {
                            const a = drawPoints[i];
                            const len = Math.hypot(p.x - a.x, p.y - a.y);
                            const mid = toPx({ x: (a.x + p.x) / 2, y: (a.y + p.y) / 2 });
                            return (
                              <text key={`seg-${i}`} x={mid.x} y={mid.y - 7} textAnchor="middle" fontSize={11} fontWeight={500} fill="#25344A" {...halo}>
                                {len.toFixed(2)}m
                              </text>
                            );
                          })}
                          {lastPx && cur && drawCursor && (
                            <>
                              <line
                                x1={lastPx.x}
                                y1={lastPx.y}
                                x2={cur.x}
                                y2={cur.y}
                                stroke={drawCursor.valid ? "#D96B44" : "#DC2626"}
                                strokeWidth={2}
                                strokeDasharray={closing ? undefined : "6 4"}
                              />
                              {(() => {
                                const from = drawPoints[drawPoints.length - 1];
                                const len = Math.hypot(drawCursor.p.x - from.x, drawCursor.p.y - from.y);
                                if (len < 0.001) return null;
                                return (
                                  <text
                                    x={(lastPx.x + cur.x) / 2}
                                    y={(lastPx.y + cur.y) / 2 - 9}
                                    textAnchor="middle"
                                    fontSize={12}
                                    fontWeight={700}
                                    fill={drawCursor.valid ? "#D96B44" : "#DC2626"}
                                    {...halo}
                                  >
                                    {len.toFixed(2)}m · {lineAngleDeg(from, drawCursor.p).toFixed(0)}°
                                  </text>
                                );
                              })()}
                            </>
                          )}
                          {placed.length >= 3 && cur && !closing && (
                            <line x1={cur.x} y1={cur.y} x2={placed[0].x} y2={placed[0].y} stroke="#25344A" strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray="2 5" />
                          )}
                          {previewPx.length >= 3 && (
                            <text x={cx} y={cy} textAnchor="middle" fontSize={12} fontWeight={600} fill="#25344A" fillOpacity={0.7} {...halo}>
                              {polygonArea(previewWorld).toFixed(1)}m²
                            </text>
                          )}
                          {placed.map((p, i) => (
                            <circle key={`pt-${i}`} data-draw-point={i} cx={p.x} cy={p.y} r={4} fill="#25344A" stroke="#FBF8F4" strokeWidth={1.5} />
                          ))}
                          {placed.length >= 3 && <circle cx={placed[0].x} cy={placed[0].y} r={closing ? 10 : 7} fill="none" stroke="#2F6B5E" strokeWidth={closing ? 2.5 : 1.5} />}
                          {cur && drawCursor && !closing && drawCursor.kind === "vertex" && (
                            <rect x={cur.x - 6} y={cur.y - 6} width={12} height={12} fill="none" stroke="#D96B44" strokeWidth={2} />
                          )}
                          {cur && drawCursor && !closing && drawCursor.kind === "grid" && (
                            <path d={`M ${cur.x - 6} ${cur.y} H ${cur.x + 6} M ${cur.x} ${cur.y - 6} V ${cur.y + 6}`} stroke="#25344A" strokeWidth={1.5} />
                          )}
                        </>
                      );
                    })()}
                  </g>
                )}
                {measureStart && measureEnd && (
                  <g className="pointer-events-none">
                    <line x1={measureStart.x} y1={measureStart.y} x2={measureEnd.x} y2={measureEnd.y} stroke="#DC2626" strokeWidth={1.5} strokeDasharray="4 2" />
                    <circle cx={measureStart.x} cy={measureStart.y} r={3} fill="#DC2626" />
                    <circle cx={measureEnd.x} cy={measureEnd.y} r={3} fill="#DC2626" />
                    <text x={(measureStart.x + measureEnd.x) / 2} y={(measureStart.y + measureEnd.y) / 2 - 8} textAnchor="middle" fontSize={12} fontWeight="600" fill="#DC2626">
                      {(Math.hypot(measureEnd.x - measureStart.x, measureEnd.y - measureStart.y) / PIXELS_PER_METRE).toFixed(2)}m
                    </text>
                  </g>
                )}
              </svg>
            </div>
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
