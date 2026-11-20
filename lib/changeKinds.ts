// The kinds of change the photo comparison can report. No imports, so the browser can use it too.
export const CHANGE_KINDS = ["no_change", "new_mark", "worse", "missing", "damage", "dirtier", "better", "cannot_compare"] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

export const CHANGE_LABELS: Record<string, string> = {
  no_change: "No visible change",
  new_mark: "New mark",
  worse: "Worse than at check-in",
  missing: "Missing",
  damage: "New damage",
  dirtier: "Dirtier",
  better: "Better than at check-in",
  cannot_compare: "Could not compare",
};

// kinds an agent has to look at (everything except no change / better)
export function needsReview(kind: string | null | undefined): boolean {
  return !!kind && kind !== "no_change" && kind !== "better";
}

