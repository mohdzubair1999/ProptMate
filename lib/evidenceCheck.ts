import { reportsDefect } from "@/lib/photoScore";
import { CONDITION_LABELS } from "@/lib/inventoryConditions";

// "Is this inventory backed by enough evidence?" - plain checks on what has been recorded, shown before an inspection is
// completed. If a deposit is disputed, the photo is what settles it: an item marked damaged with no photo is just an opinion.
// No AI and no cost. It only ever advises; completing the inspection is never blocked.

// sectionId: the room's section in the template. Photos are often attached to the whole room (a photo or comments field in that
// section) rather than to one item, so an item is judged against its own photos AND its room's.
export type EvidenceItem = { room: string; itemName: string; condition: string | null | undefined; notes: string | null | undefined; photoCount: number; sectionId?: string | null };
export type EvidenceFinding = {
  level: "important" | "tip";
  kind: "no-photo-for-damage" | "damage-only-room-photos" | "no-photo-for-wear" | "room-without-photos" | "note-mentions-defect" | "damage-without-note" | "wear-without-note" | "cleanliness-without-note" | "repeated-defect-note";
  room: string;
  item?: string;
  message: string;
};
export type EvidenceResult = { findings: EvidenceFinding[]; counts: { important: number; tip: number } };

const SERIOUS = new Set(["damaged", "beyond_economical_repair"]);
const FINE = new Set(["new", "good"]);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const label = (c: string) => (CONDITION_LABELS[c] || c).replace(/^./, (x) => x.toLowerCase());
const roomOf = (r: unknown) => text(r) || "this room";

// roomPhotos: how many photos are attached to each room as a whole, keyed by section id.
export function checkEvidence(items: EvidenceItem[], roomPhotos: Record<string, number> = {}): EvidenceResult {
  const findings: EvidenceFinding[] = [];
  const rooms = new Map<string, { name: string; items: number; photos: number; roomLevel: number }>();
  const roomLevelOf = (sectionId: string | null | undefined) => (sectionId && Number.isFinite(roomPhotos[sectionId]) && roomPhotos[sectionId] > 0 ? Math.floor(roomPhotos[sectionId]) : 0);

  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== "object") continue;
    const room = roomOf(it.room), name = text(it.itemName) || "An item", cond = text(it.condition).toLowerCase();
    const photos = Number.isFinite(it.photoCount) && it.photoCount > 0 ? Math.floor(it.photoCount) : 0;
    const sectionId = typeof it.sectionId === "string" && it.sectionId ? it.sectionId : null;
    const key = sectionId ? `section:${sectionId}` : `room:${room.toLowerCase()}`;
    const roomLevel = roomLevelOf(sectionId);
    const r = rooms.get(key) ?? { name: room, items: 0, photos: 0, roomLevel };
    r.items++;
    r.photos += photos;
    rooms.set(key, r);

    if (SERIOUS.has(cond) && photos === 0 && roomLevel > 0) {
      // the room has photos, but none is attached to this item: probably covered, worth a glance
      findings.push({ level: "tip", kind: "damage-only-room-photos", room, item: name, message: `${name} (${room}) is marked ${label(cond)} and has no photo of its own. Check that one of the ${room} photos shows it.` });
    } else if (SERIOUS.has(cond) && photos === 0) {
      findings.push({ level: "important", kind: "no-photo-for-damage", room, item: name, message: `${name} (${room}) is marked ${label(cond)} but has no photo. A photo is your evidence if the deposit is disputed.` });
    } else if (cond === "worn" && photos === 0 && roomLevel === 0) {
      findings.push({ level: "tip", kind: "no-photo-for-wear", room, item: name, message: `${name} (${room}) is marked ${label(cond)} but has no photo.` });
    }
    if (FINE.has(cond)) {
      const found = reportsDefect(text(it.notes));
      if (found.length > 0) findings.push({ level: "tip", kind: "note-mentions-defect", room, item: name, message: `${name} (${room}) is marked ${label(cond)}, but its note mentions "${found[0].replace(/\*$/, "")}". Check the condition matches.` });
    }
  }
  for (const r of rooms.values()) {
    if (r.items > 0 && r.photos === 0 && r.roomLevel === 0) findings.push({ level: "tip", kind: "room-without-photos", room: r.name, message: `No photos are attached to any item in ${r.name}.` });
  }
  // the most important first, then in a steady order so the list does not jump about
  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === "important" ? -1 : 1) || a.room.localeCompare(b.room) || (a.item ?? "").localeCompare(b.item ?? "") || a.kind.localeCompare(b.kind));
  return { findings, counts: { important: findings.filter((f) => f.level === "important").length, tip: findings.filter((f) => f.level === "tip").length } };
}
