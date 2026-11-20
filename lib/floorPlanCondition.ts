import { CONDITION_OPTIONS, CONDITION_LABELS } from "@/lib/inventoryConditions";
import { nameLikeness } from "@/lib/disputePack";

// Colouring the rooms of a floor plan by how their contents were found at the property's latest completed inspection: each room takes the colour of
// its WORST item. Pure (no database, no screen) so every rule is tested directly.

const RANK: Record<string, number> = Object.fromEntries(CONDITION_OPTIONS.map((o, i) => [o.value, i])); // the scale in order: higher is worse
// soft tints, so the room name and furniture on top stay readable; calmer for good, more serious as it gets worse
export const CONDITION_FILL: Record<string, string> = { new: "#DDEFE5", good: "#DDEFE5", wear_and_tear: "#F4EBC6", worn: "#F9DDB5", damaged: "#F5C2BE", beyond_economical_repair: "#E8A19C" };
export const CONDITION_LEGEND = CONDITION_OPTIONS.filter((o) => o.value !== "new").map((o) => ({ value: o.value, label: o.label, fill: CONDITION_FILL[o.value] }));
const MATCH = 0.85; // how alike two room names must be (when not identical once spacing and punctuation are ignored)

// words kept apart by single spaces (punctuation counts as a space), so "Lounge / Kitchen" and "Lounge/Kitchen" are the same, and word order can still be compared
const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The worst condition among each room's items, keyed by the room's name in lower case, words separated by single spaces (ignoring capitals and punctuation).
// Items with no room, or a condition that is not on the scale, are left out: a room is only coloured when something real was recorded in it.
export function worstConditionByRoom(items: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== "object") continue;
    const { room, condition } = it as { room?: unknown; condition?: unknown };
    const key = norm(room);
    if (!key || typeof condition !== "string" || !Object.prototype.hasOwnProperty.call(RANK, condition)) continue;
    if (out[key] === undefined || RANK[condition] > RANK[out[key]]) out[key] = condition;
  }
  return out;
}

// Different words for the same room. Used only as a fallback after an exact match fails, and only when it points at exactly ONE recorded room.
// Deliberately short and unambiguous: "Master bedroom" is NOT assumed to be "Bedroom 1", and a shower room is not assumed to be a bathroom.
const ALIASES: Record<string, string[]> = {
  lounge: ["lounge", "living room", "sitting room", "front room", "reception room", "reception", "living area"],
  hall: ["hall", "hallway", "entrance hall", "entrance", "hall way"],
  wc: ["wc", "w c", "toilet", "downstairs toilet", "downstairs wc", "cloakroom", "cloaks"],
  bathroom: ["bathroom", "bath room", "family bathroom", "main bathroom"],
  "en suite": ["en suite", "ensuite", "en-suite"],
  dining: ["dining room", "dining"],
  utility: ["utility", "utility room"],
  porch: ["porch", "entrance porch"],
  landing: ["landing", "upstairs landing"],
};
const ALIAS_OF: Record<string, string> = Object.fromEntries(Object.entries(ALIASES).flatMap(([canon, names]) => names.map((n) => [n, canon])));
// the name with its words made canonical, and any trailing number kept ("living room 2" and "lounge 2" agree; "lounge 1" and "lounge 2" do not)
function canonical(name: string): string {
  const m = /^(.*?)(?:\s+(\d+))?$/.exec(norm(name));
  const base = m ? m[1] : norm(name);
  return `${Object.prototype.hasOwnProperty.call(ALIAS_OF, base) ? ALIAS_OF[base] : base}${m && m[2] ? ` ${m[2]}` : ""}`;
}

// Items that have a room but a condition that is not on the current scale (older data may use other words): they cannot be coloured, so they are counted
// and the person is told, rather than being ignored silently.
export function countUnrecognisedConditions(items: unknown): number {
  let n = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== "object") continue;
    const { room, condition } = it as { room?: unknown; condition?: unknown };
    if (!norm(room)) continue;
    if (typeof condition === "string" && condition.trim() !== "" && !Object.prototype.hasOwnProperty.call(RANK, condition)) n++;
  }
  return n;
}

// The condition for a room on the plan, or null. The names must match exactly (ignoring capitals, spacing and punctuation), or be so alike that it is
// clearly the same room ("Lounge / Kitchen" and "Lounge/Kitchen"). A name that could match more than one room is NOT guessed, and a different number is a
// different room ("Bedroom 1" is never "Bedroom 2").
export function conditionForPlanRoom(planRoomName: unknown, byRoom: Record<string, string>): string | null {
  const key = norm(planRoomName);
  if (!key || !byRoom || typeof byRoom !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(byRoom, key)) return byRoom[key];
  // a recorded room that is the same room under another common name (Lounge / Living room): only when exactly one recorded room qualifies
  const canon = canonical(String(planRoomName));
  const same = Object.keys(byRoom).filter((k) => canonical(k) === canon);
  if (same.length === 1) return byRoom[same[0]];
  if (same.length > 1) return null;
  const close = Object.keys(byRoom).filter((k) => nameLikeness(String(planRoomName), k) >= MATCH);
  return close.length === 1 ? byRoom[close[0]] : null;
}

// The plan's rooms that have no record to colour them by, so the person can see WHICH rooms were skipped (and fix a name if it is only spelt differently)
export function roomsWithoutCondition(planRoomNames: unknown, byRoom: Record<string, string>): string[] {
  const out: string[] = [];
  for (const n of Array.isArray(planRoomNames) ? planRoomNames : []) {
    const name = typeof n === "string" ? n.trim() : "";
    if (name && conditionForPlanRoom(name, byRoom) === null && !out.includes(name)) out.push(name);
  }
  return out;
}

export const fillForCondition = (c: string | null): string | null => (c && Object.prototype.hasOwnProperty.call(CONDITION_FILL, c) ? CONDITION_FILL[c] : null);

// what to say the colours are based on, e.g. "Check-in, 12 March 2026"
const TYPES: Record<string, string> = { "check-in": "Check-in", "check-out": "Check-out", "mid-term": "Mid-term inspection" };
export function conditionSourceLabel(type: unknown, date: unknown, formatDate: (d: Date) => string): string | null {
  const d = date instanceof Date ? date : typeof date === "string" ? new Date(date) : null;
  if (!d || Number.isNaN(+d)) return null;
  return `${TYPES[String(type)] ?? "Inspection"}, ${formatDate(d)}`;
}
export { CONDITION_LABELS };
