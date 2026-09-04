// Single source of truth for inventory item cleanliness values. Kept separate from
// condition, since a UK check-in/check-out inventory typically assesses these as two
// distinct things — an item can be in good condition but not cleaned, or vice versa.

export const CLEANLINESS_OPTIONS = [
  { value: "professionally_cleaned", label: "Professionally cleaned" },
  { value: "clean", label: "Clean" },
  { value: "requires_cleaning", label: "Requires cleaning" },
  { value: "not_cleaned", label: "Not cleaned" },
  { value: "n/a", label: "N/A" },
  { value: "custom", label: "Custom…" },
] as const;

// A stored value only counts as one of the preset options if it exactly matches — anything
// else (including a custom-typed value) falls back to being displayed as free text, rather
// than silently coercing an unrecognised value into the nearest-looking preset label.
export const CLEANLINESS_PRESET_VALUES: Set<string> = new Set(CLEANLINESS_OPTIONS.filter((o) => o.value !== "custom").map((o) => o.value));

export const CLEANLINESS_LABELS: Record<string, string> = Object.fromEntries(CLEANLINESS_OPTIONS.map((o) => [o.value, o.label]));

// Same severity-scaling approach as CONDITION_STYLES — a genuine cleanliness issue
// ("Requires cleaning", "Not cleaned") should be visually scannable in a long item list,
// not blend in as plain grey text.
export const CLEANLINESS_STYLES: Record<string, string> = {
  professionally_cleaned: "bg-verified/10 text-verified",
  clean: "bg-verified/10 text-verified",
  requires_cleaning: "bg-signal/10 text-signal",
  not_cleaned: "bg-red-100 text-red-700",
  "n/a": "bg-slate/10 text-slate",
};
