import { CLEANLINESS_VALUES, cleanInt, cleanText, pickEnum } from "./vision";

// The item lists use four conditions only. Anything worse than "worn" (the model or a tampered request saying damaged) is recorded as worn, with the detail in the comment.
import { WALKTHROUGH_CONDITIONS } from "@/lib/walkthroughConditions";
const WORSE = new Set(["damaged", "beyond_economical_repair"]);

export const WALKTHROUGH_SYSTEM =
  "You are helping a UK property inspector build the item list for ONE room from what they said out loud while walking through it. Turn their words into inventory items with a condition and a cleanliness.\n\n" +
  "Rules:\n" +
  "- Use only what the inspector actually said. Never add an item they did not mention and never invent a condition. If they did not say a condition for an item, use 'good' only when they described it as fine, otherwise leave their wording out and choose the least severe that fits what they said.\n" +
  "- One entry per item, in the singular with a short standard name ('Walls', 'Radiator', 'Door'). Identical items go in one entry with a quantity.\n" +
  "- A remark about an item ('scuff by the door' about the walls) belongs on that item, not as a separate item.\n" +
  "- condition: exactly one of new, good, wear_and_tear (fair wear and tear: light scuffs, minor marks), worn. Choose the LEAST severe that fits what they said. If they describe damage, choose worn and state the damage in the comment.\n" +
  "- cleanliness: professionally_cleaned, clean, requires_cleaning, not_cleaned, or n/a if they did not say or it does not apply.\n" +
  "- comment: ONE short factual line in this style: material or colour or type first, then the condition, in plain comma-separated words, with locations, for example 'White emulsion walls, fair wear and tear. Faint scuffs by the door.' Only words the inspector gave you. Never say 'not tested', never recommend repairs.\n" +
  "- Do not repeat any item already on the list you are given. British English.";

export const WALKTHROUGH_SCHEMA = {
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
          condition: { type: "string", enum: WALKTHROUGH_CONDITIONS },
          cleanliness: { type: "string", enum: [...CLEANLINESS_VALUES] },
          comment: { type: "string" },
        },
        required: ["name", "condition"],
      },
    },
  },
  required: ["items"],
};

export type WalkthroughItem = { name: string; quantity: number | null; make: string | null; condition: string; cleanliness: string | null; comment: string | null };

// Used on what the model returns AND again on what the browser sends back to be saved, so a tampered request adds nothing unchecked.
export function normaliseWalkthrough(raw: { items?: unknown }, existingNames: string[] = []): WalkthroughItem[] {
  const existing = new Set(existingNames.map((n) => n.trim().toLowerCase()));
  const seen = new Set<string>();
  const out: WalkthroughItem[] = [];
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    if (!it || typeof it !== "object") continue;
    const name = cleanText((it as any).name, 60);
    if (!name) continue;
    const key = name.toLowerCase();
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    const cl = pickEnum((it as any).cleanliness, CLEANLINESS_VALUES);
    out.push({
      name, quantity: cleanInt((it as any).quantity, 1, 99), make: cleanText((it as any).make, 60),
      condition: WORSE.has((it as any).condition) ? "worn" : pickEnum((it as any).condition, WALKTHROUGH_CONDITIONS) ?? "good",
      cleanliness: cl && cl !== "n/a" ? cl : null,
      comment: cleanText((it as any).comment, 240),
    });
    if (out.length >= 40) break;
  }
  return out;
}
