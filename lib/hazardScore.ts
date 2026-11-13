import type { HazardSuggestion, Change } from "@/lib/hazardAssess";

// Scoring the damp and mould assistant against photos whose truth is known. The numbers that matter most are the SAFETY ones: how
// often it rated a real problem less seriously than it is, or gave an all-clear, because those are the mistakes that hurt people.

export const DEFAULT_SEVERITY = ["No concern", "Monitor — recheck at next visit", "Address within 28 days", "Urgent — address within 7 days"];
export type HazardCase = {
  name: string;
  photos: string[];
  previousPhotos?: string[];
  previous?: { date?: string; severity?: string; extent?: string };
  severityOptions?: string[];
  expect: { signs?: "yes" | "no"; severity?: string; atLeast?: string; trend?: Change };
};
export type HazardCaseScore = {
  name: string;
  signsCorrect: boolean | null;
  severityExact: boolean | null;
  abstained: boolean; // no severity suggested (cannot tell, or withheld)
  underRated: boolean; // suggested LESS serious than the truth: the dangerous mistake
  allClearOnProblem: boolean; // said "no" or "no concern" about a real problem
  trendCorrect: boolean | null;
  warnings: number; // blame / invented measurements / certainty removed by code
};

export function scoreHazard(c: HazardCase, s: HazardSuggestion): HazardCaseScore {
  const opts = c.severityOptions?.length ? c.severityOptions : DEFAULT_SEVERITY;
  const rank = (o: string | null | undefined) => (o ? opts.indexOf(o) : -1);
  const truth = c.expect.severity ?? c.expect.atLeast ?? null;
  const problem = c.expect.signs === "yes" || (truth !== null && rank(truth) > 0);
  const underRated = truth !== null && s.severity !== null && rank(truth) >= 0 && rank(s.severity) >= 0 && rank(s.severity) < rank(truth);
  return {
    name: c.name,
    signsCorrect: c.expect.signs ? (s.signsRaw === "unclear" ? false : s.signsRaw === c.expect.signs) : null,
    severityExact: c.expect.severity ? s.severity === c.expect.severity : null,
    abstained: s.severity === null,
    underRated,
    allClearOnProblem: problem && (s.signsRaw === "no" || (s.severity !== null && rank(s.severity) === 0)),
    trendCorrect: c.expect.trend ? s.trend?.change === c.expect.trend : null,
    warnings: s.warnings.length,
  };
}

export type HazardSummary = { cases: number; signsRight: number | null; severityExact: number | null; underRated: number; allClearOnProblem: number; abstained: number | null; trendRight: number | null; warnings: number };
export function summariseHazard(scores: HazardCaseScore[]): HazardSummary {
  const frac = (n: number, d: number) => (d === 0 ? null : n / d);
  const sg = scores.filter((s) => s.signsCorrect !== null), se = scores.filter((s) => s.severityExact !== null), tr = scores.filter((s) => s.trendCorrect !== null);
  return {
    cases: scores.length,
    signsRight: frac(sg.filter((s) => s.signsCorrect).length, sg.length),
    severityExact: frac(se.filter((s) => s.severityExact).length, se.length),
    underRated: scores.filter((s) => s.underRated).length,
    allClearOnProblem: scores.filter((s) => s.allClearOnProblem).length,
    abstained: frac(scores.filter((s) => s.abstained).length, scores.length),
    trendRight: frac(tr.filter((s) => s.trendCorrect).length, tr.length),
    warnings: scores.reduce((n, s) => n + s.warnings, 0),
  };
}
