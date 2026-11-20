// A room's saved position on the floor plan, checked before it is written to the database.
//
// The editor only ever sends sensible numbers, but the server never assumes that: a position that is not a
// finite number, or is absurdly far from the plan (the plan is a few tens of metres across at most), would
// otherwise be stored as it is and then make the drawing billions of pixels wide for everyone who opens the
// floor plan afterwards. Anything unusable becomes "no saved position" (null), which the editor treats as
// "place it automatically".
//
// Negative values are allowed on purpose. A position is the reference corner of the room's own frame, and for
// a room that has been rotated that corner can sit off to the top or left of the room you actually see.
export const MAX_POSITION_M = 200;

export function cleanPosition(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > MAX_POSITION_M) return null;
  return Math.round(value * 10000) / 10000; // a tenth of a millimetre - drags leave floating-point dust like 3.1000000000000005
}
