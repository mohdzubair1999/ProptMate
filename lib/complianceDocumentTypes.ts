// Single source of truth for compliance document types — used by both the display/status
// logic and the auto-suggest-expiry-date logic, so they can't drift out of sync with each
// other by editing one and forgetting the other.

export const TYPE_LABELS: Record<string, string> = {
  GAS_SAFETY: "Gas Safety Certificate",
  EICR: "Electrical Installation Condition Report (EICR)",
  EPC: "Energy Performance Certificate (EPC)",
  HMO_LICENCE: "HMO Licence",
  SELECTIVE_LICENCE: "Selective Licence",
  FIRE_RISK_ASSESSMENT: "Fire Risk Assessment",
  LEGIONELLA_RISK_ASSESSMENT: "Legionella Risk Assessment",
  PAT_TESTING: "PAT Testing",
  OTHER: "Other",
};

// How long each document type is typically valid for (used to auto-suggest an expiry date),
// and how far ahead of expiry to start warning (a Gas Safety cert, renewing yearly, needs an
// earlier warning than a 10-year EPC — one flat threshold for everything doesn't fit).
export const DOCUMENT_DEFAULTS: Record<string, { renewalMonths: number; warnDays: number }> = {
  GAS_SAFETY: { renewalMonths: 12, warnDays: 30 },
  EICR: { renewalMonths: 60, warnDays: 90 },
  EPC: { renewalMonths: 120, warnDays: 90 },
  HMO_LICENCE: { renewalMonths: 60, warnDays: 90 },
  SELECTIVE_LICENCE: { renewalMonths: 60, warnDays: 90 },
  FIRE_RISK_ASSESSMENT: { renewalMonths: 12, warnDays: 30 },
  LEGIONELLA_RISK_ASSESSMENT: { renewalMonths: 24, warnDays: 60 },
  PAT_TESTING: { renewalMonths: 12, warnDays: 30 },
};

// Plain setMonth() overflows into the next month when the target month is shorter (e.g. Jan
// 31 + 1 month becomes Mar 3, not Feb 28) — this clamps to the target month's actual last day.
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonthIndex = d.getMonth() + months;
  const firstOfTargetMonth = new Date(d.getFullYear(), targetMonthIndex, 1);
  const daysInTargetMonth = new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth() + 1, 0).getDate();
  firstOfTargetMonth.setDate(Math.min(d.getDate(), daysInTargetMonth));
  return firstOfTargetMonth;
}
