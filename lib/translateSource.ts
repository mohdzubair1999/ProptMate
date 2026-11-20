import { CONDITION_LABELS } from "@/lib/inventoryConditions";
import type { SourceReport, ReportSection, ReportLine } from "@/lib/translateReport";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";

// The plain-text form of a finished inspection that can be translated: from the database record, never from anything a visitor sends.
type Item = { room: string; itemName: string; condition: string; make: string | null; quantity: number | null; notes: string | null; cleanliness: string | null; templateFieldId?: string | null };
type Insp = {
  type: string; aiSummary: string | null;
  property: { address: string };
  items: Item[];
  answers: { fieldId: string; value: string | null }[];
  template: { sections: { title: string; fields: { id: string; label: string; type: string }[] }[] } | null;
};
const SKIP = new Set(["PHOTO", "SIGNATURE", "PAGE_BREAK", "INFO_TEXT", "TERMS", "GRID_SECTION"]);
const stripTags = (s: string) => s.replace(/<\/(p|li|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
const itemLines = (items: Item[]): ReportLine[] => items.map((i) => ({
  label: [i.itemName, i.quantity && i.quantity > 1 ? `x${i.quantity}` : "", i.make ? `(${i.make})` : ""].filter(Boolean).join(" "),
  value: [CONDITION_LABELS[i.condition] ?? i.condition, i.cleanliness ? `Cleanliness: ${i.cleanliness}` : "", i.notes ?? ""].filter(Boolean).join(". "),
}));

export function buildSourceReport(i: Insp): SourceReport {
  const sections: ReportSection[] = [];
  if (i.template) {
    const ans = new Map(i.answers.map((a) => [a.fieldId, a.value]));
    for (const s of i.template.sections) {
      const lines: ReportLine[] = [];
      for (const f of s.fields) {
        if (f.type === "INVENTORY_SECTION") { lines.push(...itemLines(i.items.filter((it) => it.templateFieldId === f.id))); continue; }
        if (SKIP.has(f.type)) continue;
        const raw = ans.get(f.id);
        if (raw && raw.trim()) lines.push({ label: f.label, value: stripTags(raw) });
      }
      if (lines.length) sections.push({ heading: s.title, lines });
    }
  } else {
    const rooms = [...new Set(i.items.map((it) => it.room))];
    for (const room of rooms) sections.push({ heading: room, lines: itemLines(i.items.filter((it) => it.room === room)) });
  }
  return { title: `${inspectionTypeDisplayName(i.type)} report`, summary: i.aiSummary?.trim() || null, sections };
}
