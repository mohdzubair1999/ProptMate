import { CONDITION_LABELS, CONDITION_OPTIONS } from "@/lib/inventoryConditions";
import { CLEANLINESS_LABELS } from "@/lib/inventoryCleanliness";

// The deposit dispute pack: a check-out set against its check-in, item by item. This file only DECIDES what to say (which items
// match, what changed, in what order); it invents nothing. Every statement is a recorded value shown side by side, and any
// assessment of fair wear and tear is the one already recorded on the item, labelled as advisory.

export type PackItem = {
  id: string;
  room: string;
  itemName: string;
  condition: string;
  cleanliness: string | null;
  make: string | null;
  quantity: number | null;
  notes: string | null;
  photos: { url: string }[];
  disputeRiskClassification: string | null;
  disputeRiskReasoning: string | null;
  disputeRiskConfidence: string | null;
  disputeRiskEvidenceNote: string | null;
};
export type Direction = "worse" | "better" | "same";
export type RowStatus = "removed" | "worse" | "changed" | "improved" | "added" | "unchanged";
export type PackRow = {
  key: string;
  room: string;
  itemName: string;
  status: RowStatus;
  checkIn: PackItem | null;
  checkOut: PackItem | null;
  conditionChange: Direction | null; // null when either side has a value that is not on the scale
  cleanlinessChange: Direction | null;
  notesDiffer: boolean;
  // the name it had at check-in, when that differs from its name at check-out (matched as the same item: see pairRenamed)
  renamedFrom?: string | null;
};
export type Tenancy = { checkIn: Date | null; checkOut: Date | null; months: number | null };
export type PackModel = {
  tenancy: Tenancy;
  rows: PackRow[];
  counts: { renamed: number; compared: number; unchanged: number; worse: number; improved: number; otherChange: number; added: number; removed: number };
  classifications: Record<string, number>;
};

const CONDITION_RANK: Record<string, number> = Object.fromEntries(CONDITION_OPTIONS.map((o, i) => [o.value, i]));
// cleanliness from best to worst; "n/a" and a custom value are not on the scale, so they are never called better or worse
const CLEAN_RANK: Record<string, number> = { professionally_cleaned: 0, clean: 1, requires_cleaning: 2, not_cleaned: 3 };

export const CLASSIFICATION_LABELS: Record<string, string> = {
  fair_wear_and_tear: "Fair wear and tear",
  tenant_responsibility: "Tenant responsibility",
  landlord_responsibility: "Landlord responsibility",
  unclear: "Unclear",
};
export const conditionLabel = (c: string | null | undefined) => (c ? CONDITION_LABELS[c] ?? c : "Not recorded");
export const cleanlinessLabel = (c: string | null | undefined) => (c ? (CLEANLINESS_LABELS as Record<string, string>)[c] ?? c : "Not recorded");

const norm = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const direction = (a: number | undefined, b: number | undefined): Direction | null => (a === undefined || b === undefined ? null : b > a ? "worse" : b < a ? "better" : "same");

// Whole months from check-in to check-out. A date that is missing, or a check-out before the check-in, gives null: never a guess.
export function tenancyMonths(from: Date | null, to: Date | null): number | null {
  if (!(from instanceof Date) || !(to instanceof Date) || isNaN(+from) || isNaN(+to) || +to < +from) return null;
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}
export function tenancyText(months: number | null): string {
  if (months === null) return "Not recorded";
  const y = Math.floor(months / 12), m = months % 12;
  const parts = [y ? `${y} year${y === 1 ? "" : "s"}` : "", m || !y ? `${m} month${m === 1 ? "" : "s"}` : ""].filter(Boolean);
  return parts.join(" ");
}

const ORDER: RowStatus[] = ["removed", "worse", "changed", "added", "improved", "unchanged"];

// One matched pair of items judged: what changed, and in which direction
function compareRow(key: string, before: PackItem, out: PackItem, renamedFrom: string | null = null): PackRow {
  const conditionChange = direction(CONDITION_RANK[before.condition], CONDITION_RANK[out.condition]);
  const cleanlinessChange = direction(CLEAN_RANK[before.cleanliness ?? ""], CLEAN_RANK[out.cleanliness ?? ""]);
  const notesDiffer = norm(before.notes) !== norm(out.notes);
  const worse = conditionChange === "worse" || cleanlinessChange === "worse";
  const better = conditionChange === "better" || cleanlinessChange === "better";
  // a condition or cleanliness that changed to something off the scale, or different notes, is still shown as a change
  const offScale = (norm(before.condition) !== norm(out.condition) && conditionChange === null) || (norm(before.cleanliness) !== norm(out.cleanliness) && cleanlinessChange === null);
  const status: RowStatus = worse ? "worse" : better && !worse ? "improved" : offScale || notesDiffer || norm(before.make) !== norm(out.make) ? "changed" : "unchanged";
  return { key, room: out.room, itemName: out.itemName, status, checkIn: before, checkOut: out, conditionChange, cleanlinessChange, notesDiffer, ...(renamedFrom ? { renamedFrom } : {}) };
}

// ---- items renamed between check-in and check-out ----
// An item called "Oven / cooker" at check-in and "Oven/cooker" at check-out is the same item. Items that matched nothing by exact name are paired up
// IN THE SAME ROOM when their names are essentially the same: the same words in any order, singular or plural, small typos. It is deliberately
// cautious: "Table" and "Table lamp" are different things and are never paired, and when a name could pair with more than one item it pairs with none.
const STOP = new Set(["the", "a", "an", "of", "and", "with", "in", "on", "to", "for"]);
const tokens = (name: string): string[] =>
  String(name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter((t) => t && !STOP.has(t)).map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t)).sort();
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) { const tmp = prev[j]; prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1)); diag = tmp; }
  }
  return prev[b.length];
}
// 1 = the same words; otherwise how alike the names are as text (typos), only counted for names of at least 6 letters (shorter ones differ by a letter too easily)
export function nameLikeness(a: string, b: string): number {
  const ta = tokens(a), tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  const ja = ta.join(" "), jb = tb.join(" ");
  if (Math.min(ja.length, jb.length) < 6) return 0;
  return 1 - editDistance(ja, jb) / Math.max(ja.length, jb.length);
}
export const RENAME_THRESHOLD = 0.85;
function pairRenamed(rows: PackRow[]): PackRow[] {
  const removed = rows.filter((r) => r.status === "removed"), added = rows.filter((r) => r.status === "added");
  const scored: { r: PackRow; a: PackRow; score: number }[] = [];
  for (const r of removed) for (const a of added) if (norm(r.room) === norm(a.room)) { const score = nameLikeness(r.itemName, a.itemName); if (score >= RENAME_THRESHOLD) scored.push({ r, a, score }); }
  scored.sort((x, y) => y.score - x.score);
  const used = new Set<PackRow>(), pairs: PackRow[] = [];
  for (const c of scored) {
    if (used.has(c.r) || used.has(c.a)) continue;
    // ambiguous: another still-free item is almost as alike to either side: pair neither rather than guess
    const rivals = scored.filter((o) => o !== c && !used.has(o.r) && !used.has(o.a) && (o.r === c.r || o.a === c.a) && o.score >= c.score - 0.1);
    if (rivals.length > 0) { used.add(c.r); used.add(c.a); continue; }
    used.add(c.r); used.add(c.a);
    pairs.push(compareRow(`${norm(c.a.room)}|${norm(c.a.itemName)}`, c.r.checkIn!, c.a.checkOut!, c.r.itemName));
  }
  // an ambiguous pair was marked used only so it is not reconsidered: put those back as they were
  const paired = new Set(pairs.flatMap((p) => [p.checkIn, p.checkOut]));
  return [...rows.filter((r) => !((r.status === "removed" && paired.has(r.checkIn)) || (r.status === "added" && paired.has(r.checkOut)))), ...pairs];
}

export function buildDisputePack(checkInIn: { date: Date | null; items: PackItem[] } | null | undefined, checkOutIn: { date: Date | null; items: PackItem[] } | null | undefined): PackModel {
  const checkIn = checkInIn && typeof checkInIn === "object" ? checkInIn : { date: null, items: [] };
  const checkOut = checkOutIn && typeof checkOutIn === "object" ? checkOutIn : { date: null, items: [] };
  const tenancy: Tenancy = { checkIn: checkIn.date, checkOut: checkOut.date, months: tenancyMonths(checkIn.date, checkOut.date) };
  // items are matched by room and name (ignoring capitals and spacing); several of the same item in one room pair up in order
  const queue = new Map<string, PackItem[]>();
  for (const it of Array.isArray(checkIn.items) ? checkIn.items : []) {
    if (!it) continue;
    const k = `${norm(it.room)}|${norm(it.itemName)}`;
    queue.set(k, [...(queue.get(k) ?? []), it]);
  }
  const rows: PackRow[] = [];
  for (const out of Array.isArray(checkOut.items) ? checkOut.items : []) {
    if (!out) continue;
    const key = `${norm(out.room)}|${norm(out.itemName)}`;
    const before = queue.get(key)?.shift() ?? null;
    if (!before) { rows.push({ key, room: out.room, itemName: out.itemName, status: "added", checkIn: null, checkOut: out, conditionChange: null, cleanlinessChange: null, notesDiffer: false }); continue; }
    rows.push(compareRow(key, before, out));
  }
  for (const left of queue.values()) for (const it of left) rows.push({ key: `${norm(it.room)}|${norm(it.itemName)}`, room: it.room, itemName: it.itemName, status: "removed", checkIn: it, checkOut: null, conditionChange: null, cleanlinessChange: null, notesDiffer: false });

  rows.splice(0, rows.length, ...pairRenamed(rows));

  // most important first; within a group, by room then item, and otherwise in the order recorded
  const idx = new Map(rows.map((r, i) => [r, i]));
  rows.sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || norm(a.room).localeCompare(norm(b.room)) || norm(a.itemName).localeCompare(norm(b.itemName)) || (idx.get(a)! - idx.get(b)!));

  const count = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const classifications: Record<string, number> = {};
  for (const r of rows) {
    const c = r.checkOut?.disputeRiskClassification;
    if (c && r.status !== "unchanged") classifications[c] = (classifications[c] ?? 0) + 1;
  }
  return {
    tenancy, rows,
    counts: { renamed: rows.filter((r) => r.renamedFrom).length, compared: rows.filter((r) => r.checkIn && r.checkOut).length, unchanged: count("unchanged"), worse: count("worse"), improved: count("improved"), otherChange: count("changed"), added: count("added"), removed: count("removed") },
    classifications,
  };
}

// ---------------------------------------------------------------------------------------------------------------------------
// Room-by-room pack: for a check-in that came from ANOTHER COMPANY's report. That kind of check-in is stored as a short summary for each
// room (read from their document), not as individual items, so items cannot be compared one by one. Each room therefore shows their
// summary next to the check-out items recorded here, and nothing is called "worse" or "unchanged": there is no item-level check-in to
// compare with. (The check-in's own date is also not used: for an imported report it is the day it was uploaded, not the real one.)

export type RoomSummary = { room: string; summary: string };
export type RoomPackRoom = { room: string; summary: string | null; items: PackItem[] };
export type RoomPackModel = {
  rooms: RoomPackRoom[];
  unmatchedSummaries: RoomSummary[]; // rooms the report describes that have no items at check-out
  counts: { rooms: number; items: number; roomsWithSummary: number; itemsBelowGood: number };
};

const MAX_SUMMARY_ROOMS = 60;
const MAX_SUMMARY_CHARS = 3000;
// the stored value is JSON text (or already an array); anything unreadable is simply "no summaries", never a crash
export function parseRoomSummaries(raw: unknown): RoomSummary[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try { v = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(v)) return [];
  const out: RoomSummary[] = [];
  for (const r of v) {
    if (!r || typeof r !== "object") continue;
    const room = typeof (r as any).room === "string" ? (r as any).room.replace(/\s+/g, " ").trim().slice(0, 200) : "";
    const summary = typeof (r as any).summary === "string" ? (r as any).summary.trim().slice(0, MAX_SUMMARY_CHARS) : "";
    if (room && summary) out.push({ room, summary });
    if (out.length >= MAX_SUMMARY_ROOMS) break;
  }
  return out;
}

const BELOW_GOOD = CONDITION_RANK["wear_and_tear"];
export const isBelowGood = (condition: string | null | undefined) => (CONDITION_RANK[condition ?? ""] ?? -1) >= BELOW_GOOD;

export function buildRoomPack(summariesIn: unknown, checkOutIn: { items: PackItem[] } | null | undefined): RoomPackModel {
  const summaries = parseRoomSummaries(summariesIn);
  const items = Array.isArray(checkOutIn?.items) ? checkOutIn!.items.filter((i) => i && typeof i === "object") : [];
  const summaryByRoom = new Map<string, string[]>();
  const summaryName = new Map<string, string>();
  for (const s of summaries) {
    const k = norm(s.room);
    summaryByRoom.set(k, [...(summaryByRoom.get(k) ?? []), s.summary]);
    if (!summaryName.has(k)) summaryName.set(k, s.room);
  }
  // rooms in the order they were recorded at check-out; within a room, the more serious conditions first
  const order: string[] = [], names = new Map<string, string>(), byRoom = new Map<string, PackItem[]>();
  for (const it of items) {
    const k = norm(it.room);
    if (!byRoom.has(k)) { byRoom.set(k, []); order.push(k); names.set(k, String(it.room ?? "").trim()); }
    byRoom.get(k)!.push(it);
  }
  const rooms: RoomPackRoom[] = order.map((k) => {
    const its = byRoom.get(k)!;
    const idx = new Map(its.map((i, n) => [i, n]));
    its.sort((a, b) => (CONDITION_RANK[b.condition] ?? -1) - (CONDITION_RANK[a.condition] ?? -1) || (idx.get(a)! - idx.get(b)!));
    return { room: names.get(k) || "Room not recorded", summary: summaryByRoom.get(k)?.join("\n\n") ?? null, items: its };
  });
  const unmatchedSummaries = [...summaryByRoom.keys()].filter((k) => !byRoom.has(k)).map((k) => ({ room: summaryName.get(k)!, summary: summaryByRoom.get(k)!.join("\n\n") }));
  return {
    rooms, unmatchedSummaries,
    counts: { rooms: rooms.length, items: items.length, roomsWithSummary: rooms.filter((r) => r.summary !== null).length, itemsBelowGood: items.filter((i) => isBelowGood(i.condition)).length },
  };
}

// Side by side (their summary on the left, our items on the right) reads best, but a row cannot be split across pages: if either side is
// taller than a page, the PDF library cuts the text off. So a room is laid out side by side only when both sides are comfortably short;
// otherwise the two parts are stacked full width, and flow across pages freely. The heights are estimates in points for a column about
// 230 points wide (about 40 characters a line, about 12 points a line).
const LINE_PT = 12, CHARS_PER_LINE = 40, SIDE_BY_SIDE_MAX_PT = 560;
const lines = (text: string | null | undefined, charsPerLine = CHARS_PER_LINE) => (text && text.trim() ? Math.ceil(String(text).length / charsPerLine) : 0);
export function estimateRoomHeights(r: RoomPackRoom): { summary: number; items: number } {
  const summary = 14 + (r.summary ? lines(r.summary) : 1) * LINE_PT;
  let items = 14;
  for (const it of r.items) {
    items += 48 + lines(it.notes) * 11 + (it.make ? 12 : 0);
    if (isBelowGood(it.condition)) {
      items += Math.min(it.photos?.length ?? 0, 2) > 0 ? 80 : 0;
      if (it.disputeRiskClassification) items += 30 + lines(it.disputeRiskReasoning) * 11;
    }
  }
  return { summary, items };
}
export function roomLayout(r: RoomPackRoom): "side" | "stack" {
  const h = estimateRoomHeights(r);
  return Math.max(h.summary, h.items) <= SIDE_BY_SIDE_MAX_PT ? "side" : "stack";
}
