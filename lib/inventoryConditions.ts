// Single source of truth for inventory item condition values — the professional UK inventory
// scale, not a generic Good/Fair/Poor. "Fair wear and tear" specifically matters: UK deposit
// protection schemes (TDS, DPS, mydeposits) distinguish fair wear and tear (a tenant can't be
// charged for it) from actual damage (they can) — using the real term here isn't just cosmetic,
// it's the language that matters if this ever ends up in a deposit dispute.

export const CONDITION_OPTIONS = [
  { value: "new", label: "New" },
  { value: "good", label: "Good condition" },
  { value: "wear_and_tear", label: "Wear and tear" },
  { value: "worn", label: "Worn" },
  { value: "damaged", label: "Damaged" },
  { value: "beyond_economical_repair", label: "Beyond economical repair" },
] as const;

export const CONDITION_LABELS: Record<string, string> = Object.fromEntries(
  CONDITION_OPTIONS.map((o) => [o.value, o.label])
);

// Styling gets progressively more serious from "new" (calm/positive) through to "beyond
// economical repair" (clear red flag) — not just alternating colours, so the visual weight
// actually reflects severity.
export const CONDITION_STYLES: Record<string, string> = {
  new: "bg-verified/10 text-verified",
  good: "bg-verified/10 text-verified",
  wear_and_tear: "bg-signal/10 text-signal",
  worn: "bg-orange-100 text-orange-700",
  damaged: "bg-red-100 text-red-700",
  beyond_economical_repair: "bg-red-100 text-red-700",
};
