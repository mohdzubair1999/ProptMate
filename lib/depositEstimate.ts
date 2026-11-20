// The deposit-deduction estimator: SUGGESTED costs for the defects found at check-out, from the company's own price list, reduced for fair wear and tear by the item's age.
// Everything here is a suggestion for an agent to review. No database code, so it can be tested.
export type PriceEntry = { id: string; name: string; keywords: string; pricePence: number; lifespanYears: number | null };
export type DraftLine = {
  key: string; room: string; itemName: string; issue: string; kind: string;
  entryId: string | null; label: string; qty: number; unitPence: number;
  ageYears: number | null; lifespanYears: number | null; include: boolean;
};
export type Defect = { key: string; room: string; itemName: string; issue: string; kind: string };

export const DEPOSIT_LABEL = "Suggested costs only. An agent must review every line. The tenant's deposit can only be reduced for loss or damage beyond fair wear and tear that the check-in and check-out evidence supports.";

// Starting prices an agent can add and then edit. Plainly examples, not market rates.
export const EXAMPLE_PRICES: { name: string; keywords: string; pricePence: number; lifespanYears: number | null }[] = [
  { name: "Professional clean (per room)", keywords: "clean, dirty, dirt, grease, stain", pricePence: 4500, lifespanYears: null },
  { name: "Repaint a wall", keywords: "wall, paint, scuff, mark, ceiling", pricePence: 9000, lifespanYears: 5 },
  { name: "Replace carpet (per room)", keywords: "carpet, flooring, floor, stain", pricePence: 35000, lifespanYears: 8 },
  { name: "Replace mattress", keywords: "mattress, bed", pricePence: 25000, lifespanYears: 8 },
  { name: "Replace a door", keywords: "door, damage, hole", pricePence: 18000, lifespanYears: 15 },
  { name: "Replace a missing item", keywords: "missing, replace", pricePence: 3000, lifespanYears: null },
];

const KIND_HINTS: Record<string, string> = { dirtier: "clean dirty", missing: "missing replace", new_mark: "mark scuff", damage: "damage", worse: "damage" };

export function keywordList(keywords: string): string[] {
  return String(keywords || "").toLowerCase().split(/[,;\n]/).map((k) => k.trim()).filter((k) => k.length >= 2);
}

// The best price line for a defect, or null when nothing matches (the agent picks one or types their own).
export function suggestEntry(defect: { itemName: string; room: string; issue: string; kind: string }, entries: PriceEntry[]): PriceEntry | null {
  const hay = `${defect.itemName} ${defect.room} ${defect.issue} ${KIND_HINTS[defect.kind] ?? ""}`.toLowerCase();
  let best: PriceEntry | null = null, bestScore = 0;
  for (const e of entries) {
    const score = keywordList(e.keywords).reduce((n, k) => n + (hay.includes(k) ? 1 : 0), 0);
    if (score > bestScore) { best = e; bestScore = score; }
  }
  return best;
}

// The share of the cost that can fairly be charged: 100% for something with no stated lifespan or no age, falling to 0% by the end of its life.
export function tenantShare(ageYears: number | null | undefined, lifespanYears: number | null | undefined): number {
  if (!Number.isFinite(ageYears as number) || !Number.isFinite(lifespanYears as number) || (lifespanYears as number) <= 0 || (ageYears as number) < 0) return 1;
  return Math.min(1, Math.max(0, 1 - (ageYears as number) / (lifespanYears as number)));
}

export function lineAmountPence(l: Pick<DraftLine, "qty" | "unitPence" | "ageYears" | "lifespanYears">): number {
  const qty = Number.isFinite(l.qty) && l.qty > 0 ? Math.min(999, l.qty) : 0;
  const unit = Number.isFinite(l.unitPence) && l.unitPence > 0 ? Math.min(100_000_000, Math.round(l.unitPence)) : 0;
  return Math.round(qty * unit * tenantShare(l.ageYears, l.lifespanYears));
}

export function scheduleTotalPence(lines: DraftLine[]): number {
  return lines.filter((l) => l.include).reduce((n, l) => n + lineAmountPence(l), 0);
}

export function formatPounds(pence: number): string {
  const p = Number.isFinite(pence) ? Math.round(pence) : 0;
  return `£${(p / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The check-out items that look like they need a deduction: the photo comparison flagged a change, the item needs cleaning, or it is recorded as damaged.
export function defectsFromItems(items: { id: string; room: string; itemName: string; condition: string; cleanliness: string | null; changeKind: string | null; changeSummary: string | null }[]): Defect[] {
  const out: Defect[] = [];
  for (const i of items) {
    const flagged = !!i.changeKind && i.changeKind !== "no_change" && i.changeKind !== "better" && i.changeKind !== "cannot_compare";
    if (flagged) { out.push({ key: `${i.id}:change`, room: i.room, itemName: i.itemName, issue: i.changeSummary || "Changed since check-in", kind: i.changeKind as string }); continue; }
    if (i.condition === "damaged" || i.condition === "beyond_economical_repair") { out.push({ key: `${i.id}:condition`, room: i.room, itemName: i.itemName, issue: i.condition === "damaged" ? "Recorded as damaged" : "Recorded as beyond economical repair", kind: "damage" }); continue; }
    if (i.cleanliness === "requires_cleaning" || i.cleanliness === "not_cleaned") out.push({ key: `${i.id}:clean`, room: i.room, itemName: i.itemName, issue: i.cleanliness === "not_cleaned" ? "Not cleaned" : "Requires cleaning", kind: "dirtier" });
  }
  return out;
}

export function linesFromDefects(defects: Defect[], entries: PriceEntry[]): DraftLine[] {
  return defects.map((d) => {
    const e = suggestEntry(d, entries);
    return { key: d.key, room: d.room, itemName: d.itemName, issue: d.issue, kind: d.kind, entryId: e?.id ?? null, label: e?.name ?? "", qty: 1, unitPence: e?.pricePence ?? 0, ageYears: null, lifespanYears: e?.lifespanYears ?? null, include: !!e };
  });
}

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const num = (v: unknown, min: number, max: number, dflt: number | null) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : dflt; };

// Reads a saved or posted draft back safely: only known fields, clipped text, sane numbers. Returns null if it is not a list.
export function parseDraft(json: unknown): DraftLine[] | null {
  let v: unknown = json;
  if (typeof json === "string") { try { v = JSON.parse(json); } catch { return null; } }
  if (!Array.isArray(v)) return null;
  return v.slice(0, 300).filter((x) => x && typeof x === "object").map((x: any, i) => ({
    key: clip(x.key || `line-${i}`, 80), room: clip(x.room, 120), itemName: clip(x.itemName, 160), issue: clip(x.issue, 600), kind: clip(x.kind, 40),
    entryId: x.entryId ? clip(x.entryId, 60) : null, label: clip(x.label, 160),
    qty: num(x.qty, 0, 999, 1) as number, unitPence: Math.round(num(x.unitPence, 0, 100_000_000, 0) as number),
    ageYears: num(x.ageYears, 0, 200, null), lifespanYears: num(x.lifespanYears, 0, 200, null), include: x.include === true,
  }));
}

export function serialiseDraft(lines: DraftLine[]): string { return JSON.stringify(lines); }

// Plain "Reason: amount" lines for a copy-and-paste or print summary
export function scheduleText(lines: DraftLine[]): string {
  const rows = lines.filter((l) => l.include).map((l) => `${l.room} - ${l.itemName}: ${l.label || "Deduction"}${l.qty !== 1 ? ` x${l.qty}` : ""}${tenantShare(l.ageYears, l.lifespanYears) < 1 ? ` (${Math.round(tenantShare(l.ageYears, l.lifespanYears) * 100)}% after fair wear and tear)` : ""} - ${formatPounds(lineAmountPence(l))}`);
  return [...rows, `Total suggested: ${formatPounds(scheduleTotalPence(lines))}`, DEPOSIT_LABEL].join("\n");
}
