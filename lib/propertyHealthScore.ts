// Combines three genuinely different signals into one 0-100 rollup number for a property's
// dashboard card - condition (from inventory item records), compliance (certificate expiry),
// and open issues (unresolved QR-scanned reports). Deliberately a pure function taking plain
// data in and returning a plain result out, with no direct database access itself, so the
// actual scoring logic can be hand-tested with made-up scenarios before ever touching a real
// property's data.

const CONDITION_SCORES: Record<string, number> = {
  new: 100,
  good: 90,
  wear_and_tear: 70,
  worn: 50,
  damaged: 25,
  beyond_economical_repair: 0,
};

export type HealthScoreInput = {
  // Condition values from the property's most recent completed inspection's items - only
  // ones with a condition actually set are meaningful here.
  itemConditions: string[];
  // Each compliance document's expiry date, or null if it doesn't expire / wasn't set.
  complianceExpiryDates: (Date | null)[];
  openIssueCount: number;
  now?: Date; // injectable for testing - real callers omit this and get the genuine current time
};

export type HealthScoreResult = {
  score: number; // 0-100, rounded to the nearest whole number
  band: "good" | "fair" | "poor"; // a coarse label for quick visual treatment
  components: {
    condition: number | null; // null when there's no inspection data yet at all
    compliance: number;
    openIssues: number;
  };
};

function scoreCondition(itemConditions: string[]): number | null {
  const known = itemConditions.filter((c) => c in CONDITION_SCORES);
  if (known.length === 0) return null;
  const total = known.reduce((sum, c) => sum + CONDITION_SCORES[c], 0);
  return total / known.length;
}

function scoreCompliance(expiryDates: (Date | null)[], now: Date): number {
  // No compliance documents on file at all is treated as a genuine, real gap - not neutral -
  // since UK rental properties are legally required to hold certain certificates, and a
  // property with zero on record is a real thing worth surfacing, not an "unknown" to hide.
  if (expiryDates.length === 0) return 20;

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const perDocument = expiryDates.map((expiry): number => {
    if (!expiry) return 100; // no expiry set on this one - nothing to be concerned about
    const msUntilExpiry = expiry.getTime() - now.getTime();
    if (msUntilExpiry < 0) return 0; // already expired
    if (msUntilExpiry < THIRTY_DAYS_MS) return 50; // expiring soon
    return 100;
  });
  return perDocument.reduce((sum, s) => sum + s, 0) / perDocument.length;
}

function scoreOpenIssues(openIssueCount: number): number {
  return Math.max(0, 100 - openIssueCount * 25);
}

export function calculatePropertyHealthScore(input: HealthScoreInput): HealthScoreResult {
  const now = input.now || new Date();

  const conditionScore = scoreCondition(input.itemConditions);
  const complianceScore = scoreCompliance(input.complianceExpiryDates, now);
  const openIssuesScore = scoreOpenIssues(input.openIssueCount);

  // Condition, compliance, and open issues are weighted 40/40/20 when all three have real
  // data - when condition is genuinely unknown (no inspection yet), the remaining two are
  // re-weighted proportionally (50/50) rather than treating the missing piece as a zero,
  // since "no inspection yet" isn't the same thing as "bad condition".
  let weighted: number;
  if (conditionScore === null) {
    weighted = complianceScore * 0.5 + openIssuesScore * 0.5;
  } else {
    weighted = conditionScore * 0.4 + complianceScore * 0.4 + openIssuesScore * 0.2;
  }

  const score = Math.round(weighted);
  const band = score >= 80 ? "good" : score >= 55 ? "fair" : "poor";

  return {
    score,
    band,
    components: { condition: conditionScore === null ? null : Math.round(conditionScore), compliance: Math.round(complianceScore), openIssues: Math.round(openIssuesScore) },
  };
}
