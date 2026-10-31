import { CONDITION_VALUES, cleanInt, cleanText, pickEnum } from "./vision";

export const IDENTIFY_SYSTEM =
  "You are helping a UK property inspector build the item list for an inventory from photos of ONE room or area. List the distinct, clearly visible items that belong in an inventory of this room - fixtures, fittings, furniture and appliances, plus the standard fabric of the room that UK inventories normally list (walls, ceiling, flooring, skirting boards, doors, windows).\n\n" +
  "Rules:\n" +
  "- Only list what you can actually see in the photos. Never list something that is hidden or that you are assuming is there, and never invent items.\n" +
  "- Use short, standard inventory names in the singular (for example 'Double socket', 'Radiator', 'Curtains', 'Oven'). Put repeated identical items in ONE entry with a quantity - three identical sockets are 'Double socket' with quantity 3.\n" +
  "- Do not list the tenant's personal belongings (clothes, food, toiletries, ornaments, photographs, bedding they have brought) or rubbish.\n" +
  "- make: give a brand only when it is clearly legible in the photos; otherwise leave it out.\n" +
  "- condition: your best reading using this scale, choosing the LEAST severe that fits what you can see: new, good, wear_and_tear (normal fair wear and tear), worn, damaged, beyond_economical_repair.\n" +
  "- note: one short factual observation only when something is genuinely notable (a mark, a stain, damage); otherwise leave it out. Never recommend repairs or actions.\n" +
  "- Do not repeat any item already on the list you are given.\n" +
  "- If the photos are not enough to be sure, return fewer items rather than guessing. Use British English.";

export const IDENTIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "integer", minimum: 1, maximum: 99 },
          make: { type: "string" },
          condition: { type: "string", enum: CONDITION_VALUES },
          note: { type: "string" },
        },
        required: ["name", "condition"],
      },
    },
    photo_quality_note: { type: "string" },
  },
  required: ["items"],
};

export type SuggestedItem = { name: string; quantity: number | null; make: string | null; condition: string; note: string | null };

// The same cleaning is used twice: on what the model suggests, and again on whatever the browser
// sends back when the person confirms - so a tampered request can't add anything unchecked.
export function normaliseSuggestions(raw: { items?: unknown }, existingNames: string[]): SuggestedItem[] {
  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: SuggestedItem[] = [];
  for (const it of Array.isArray(raw.items) ? raw.items : []) {
    if (!it || typeof it !== "object") continue;
    const name = cleanText((it as any).name, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      quantity: cleanInt((it as any).quantity, 1, 99),
      make: cleanText((it as any).make, 60),
      condition: pickEnum((it as any).condition, CONDITION_VALUES) ?? "good",
      note: cleanText((it as any).note, 200),
    });
    if (out.length >= 40) break;
  }
  return out;
}
