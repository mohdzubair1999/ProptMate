import { CONDITION_VALUES, CLEANLINESS_VALUES, cleanText, pickEnum } from "./vision";

export const DEFECT_TYPES = ["wear", "scuff", "stain", "crack", "chip", "burn", "mould_or_damp", "missing", "broken", "dirt", "other"];
export const SEVERITIES = ["minor", "moderate", "major"];
export const CONFIDENCES = ["high", "medium", "low"];

export const ASSESS_SYSTEM =
  "You are helping a UK property inspector complete an inventory / condition record. You are shown photos of ONE item or area and you propose a condition rating, a cleanliness rating and a short factual description. You are assisting, not replacing the inspector's judgement - they will check your suggestion against the photos before using it.\n\n" +
  "Rules:\n" +
  "- Describe only what is visibly present. Never guess at a cause you cannot see, and never mention anything you cannot see - do not write that something was 'not tested' or 'not checked'.\n" +
  "- This is a factual record, not a maintenance report. State what is observed. Never recommend repairs or actions, and avoid phrasing such as 'should be repaired' or 'requires attention'.\n" +
  "- Use British English and plain, short sentences.\n\n" +
  "Condition scale - choose exactly one:\n" +
  "new: unused or as new, no marks at all.\n" +
  "good: good condition, no more than the very slightest marks.\n" +
  "wear_and_tear: normal, fair wear and tear for the item's age and use - light scuffs, minor marks, slight fading, no real damage. This is what a tenant cannot be charged for.\n" +
  "worn: noticeably worn or tired but not damaged - heavier wear, marked paint, fraying, dulling.\n" +
  "damaged: actual damage beyond fair wear and tear - chips, cracks, holes, burns, deep stains, breakages.\n" +
  "beyond_economical_repair: so badly damaged that repair would not be worthwhile.\n" +
  "Choose the LEAST severe rating that fits what you can actually see. Do not mistake normal ageing for damage.\n\n" +
  "If the photos do not let you judge reliably (too dark, blurred, too far away, or the item is not visible), say so in photo_quality_note and set confidence to 'low'.\n\n" +
  "Cleanliness: professionally_cleaned, clean, requires_cleaning, not_cleaned, or n/a when cleanliness is not relevant to this item or cannot be judged from the photos.\n\n" +
  "Defects: list each distinct visible defect separately, with where it is on the item and how severe it is. Leave the list empty when there is nothing notable. Do not pad it.\n\n" +
  "If check-in photos are provided, compare them with the current photos. In changes_since_check_in list only genuine visible differences (new marks, damage, staining, missing parts). If nothing has visibly changed, return an empty list. Never report a difference that is only down to lighting, angle or photo quality.";

export const ASSESS_SCHEMA = {
  type: "object",
  properties: {
    condition: { type: "string", enum: CONDITION_VALUES },
    cleanliness: { type: "string", enum: CLEANLINESS_VALUES },
    summary: { type: "string", description: "One to three short factual sentences describing the visible condition." },
    defects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          location: { type: "string", description: "Where on the item, e.g. 'lower left corner'." },
          severity: { type: "string", enum: SEVERITIES },
          type: { type: "string", enum: DEFECT_TYPES },
        },
        required: ["description", "severity"],
      },
    },
    changes_since_check_in: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: CONFIDENCES },
    photo_quality_note: { type: "string" },
  },
  required: ["condition", "summary", "confidence"],
};

export type Assessment = {
  condition: string;
  cleanliness: string | null;
  summary: string;
  defects: { description: string; location: string | null; severity: string; type: string | null }[];
  changes: string[];
  confidence: string;
  photoNote: string | null;
};

// Turns whatever the model returned into something safe to show and save: every choice is checked
// against the app's own lists, every piece of text is trimmed and length-limited, and anything
// unrecognised is dropped rather than passed along. Returns null when there's no usable condition
// or description at all.
export function normaliseAssessment(raw: Record<string, unknown>, comparedWithCheckIn: boolean): Assessment | null {
  const condition = pickEnum(raw.condition, CONDITION_VALUES);
  const summary = cleanText(raw.summary, 500);
  if (!condition || !summary) return null;

  const defects: Assessment["defects"] = [];
  for (const d of Array.isArray(raw.defects) ? raw.defects : []) {
    if (!d || typeof d !== "object") continue;
    const description = cleanText((d as any).description, 200);
    if (!description) continue;
    defects.push({
      description,
      location: cleanText((d as any).location, 80),
      severity: pickEnum((d as any).severity, SEVERITIES) ?? "minor",
      type: pickEnum((d as any).type, DEFECT_TYPES),
    });
    if (defects.length >= 8) break;
  }

  const changes: string[] = [];
  if (comparedWithCheckIn) {
    for (const c of Array.isArray(raw.changes_since_check_in) ? raw.changes_since_check_in : []) {
      const t = cleanText(c, 240);
      if (t) changes.push(t);
      if (changes.length >= 8) break;
    }
  }

  return {
    condition,
    cleanliness: pickEnum(raw.cleanliness, CLEANLINESS_VALUES),
    summary,
    defects,
    changes,
    confidence: pickEnum(raw.confidence, CONFIDENCES) ?? "low",
    photoNote: cleanText(raw.photo_quality_note, 200),
  };
}
