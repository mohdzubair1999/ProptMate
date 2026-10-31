import { reportsDefect } from "@/lib/photoScore";
import { CONDITION_LABELS } from "@/lib/inventoryConditions";
import type { EvidenceFinding, EvidenceResult } from "@/lib/evidenceCheck";

// "Before you finish": plain checks that a recorded inventory is complete enough to stand up in a deposit dispute. The existing evidence
// check looks at PHOTOS; these look at the WORDS: a defect with no description, a cleaning issue with no detail, and the same defect
// note copied onto different items. No AI, no cost, and they only advise: completing an inspection is never blocked.

export type ProofItem = { room: string; itemName: string; condition?: string | null; cleanliness?: string | null; notes?: string | null };

const SERIOUS = new Set(["damaged", "beyond_economical_repair"]);
const NEEDS_CLEANING: Record<string, string> = { requires_cleaning: "requires cleaning", not_cleaned: "not cleaned" };
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const roomOf = (r: unknown) => text(r) || "this room";
const lower = (c: string) => (CONDITION_LABELS[c] || c).replace(/^./, (x) => x.toLowerCase());
// a note that says something: at least three letters or digits (so "-", "n/a", "." or "  " do not count as a description)
const hasNote = (n: unknown) => (text(n).match(/[\p{L}\p{N}]/gu) || []).length >= 3;
const normNote = (n: string) => n.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function proofreadInventory(items: ProofItem[]): EvidenceFinding[] {
  const out: EvidenceFinding[] = [];
  const defectNotes = new Map<string, { note: string; at: { room: string; item: string }[] }>();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it !== "object") continue;
    const room = roomOf(it.room), name = text(it.itemName) || "An item", cond = text(it.condition).toLowerCase(), clean = text(it.cleanliness).toLowerCase();
    const noted = hasNote(it.notes);
    if (SERIOUS.has(cond) && !noted) out.push({ level: "important", kind: "damage-without-note", room, item: name, message: `${name} (${room}) is marked ${lower(cond)} but has no note saying what the damage is. The report reads the note; the photo only backs it up.` });
    else if (cond === "worn" && !noted) out.push({ level: "tip", kind: "wear-without-note", room, item: name, message: `${name} (${room}) is marked ${lower(cond)} but has no note describing the wear.` });
    if (NEEDS_CLEANING[clean] && !noted) out.push({ level: "tip", kind: "cleanliness-without-note", room, item: name, message: `${name} (${room}) is marked ${NEEDS_CLEANING[clean]} but has no note saying what needs cleaning. A cleaning claim needs that detail.` });
    if (noted && reportsDefect(text(it.notes)).length > 0) {
      const key = normNote(text(it.notes));
      if (key.length >= 12) {
        const g = defectNotes.get(key) ?? { note: text(it.notes), at: [] };
        g.at.push({ room, item: name });
        defectNotes.set(key, g);
      }
    }
  }
  // the same defect note on two or more DIFFERENT items: probably copied across, so check it really applies to each
  for (const g of defectNotes.values()) {
    const names = new Set(g.at.map((a) => `${a.room}|${a.item}`.toLowerCase()));
    if (names.size < 2) continue;
    const list = g.at.slice(0, 3).map((a) => `${a.item} (${a.room})`).join(", ") + (g.at.length > 3 ? ` and ${g.at.length - 3} more` : "");
    const first = g.at[0];
    out.push({ level: "tip", kind: "repeated-defect-note", room: first.room, item: first.item, message: `The same note about a defect, "${g.note.length > 60 ? g.note.slice(0, 57) + "…" : g.note}", appears on ${list}. Check it applies to each.` });
  }
  return out;
}

// the existing evidence findings plus these, in the same order and with the counts recomputed
export function mergeEvidence(base: EvidenceResult, extra: EvidenceFinding[]): EvidenceResult {
  const findings = [...(base?.findings ?? []), ...(Array.isArray(extra) ? extra : [])];
  findings.sort((a, b) => (a.level === b.level ? 0 : a.level === "important" ? -1 : 1) || a.room.localeCompare(b.room) || (a.item ?? "").localeCompare(b.item ?? "") || a.kind.localeCompare(b.kind));
  return { findings, counts: { important: findings.filter((f) => f.level === "important").length, tip: findings.filter((f) => f.level === "tip").length } };
}
