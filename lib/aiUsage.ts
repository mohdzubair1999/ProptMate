import { prisma } from "@/lib/prisma";

// What the team has used the AI features for. COUNTS ONLY: how many requests, on which day, for which feature. No prompts, photos or answers are
// kept here. It deliberately shows no money: prices change and differ by model, and a figure that is out of date is worse than none.

export const USAGE_FEATURES: Record<string, string> = {
  "analyze-photo": "Photo analysis (Quick)",
  "analyze-photo-deep": "Photo analysis (Deep)",
  "analyze-photo-detailed": "Photo analysis (Detailed)",
  "assess-hazard": "Damp and mould assistant",
  "read-photo": "Meter and label reader",
  summarize: "Summaries",
  polish: "Polish my notes",
  "synthesize-descriptions": "Combine photo descriptions",
  "generate-floor-plan": "Floor plan from a sketch",
  "import-checkin-report": "Import another company's check-in",
  "extract-compliance-document": "Compliance document reader",
  "suggest-summary-reference": "Summary reference suggestions",
  "assess-item": "Item condition assistant",
  "assess-item-deep": "Item condition assistant (Deep)",
  "identify-items": "Item identifier",
  "identify-items-deep": "Item identifier (Deep)",
  "dispute-risk": "Dispute risk check",
  "voice-note": "Voice notes",
};
export const featureLabel = (key: string) => USAGE_FEATURES[key] ?? key;

// the UK calendar day, as YYYY-MM-DD (a request at 00:30 on a summer morning belongs to that day, not the one before)
export const ukDay = (d: Date = new Date()): string => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });

// Adds one request (and what it counted against the limits) to today's row for this company and feature. NEVER throws: counting must never
// stop an AI feature from working.
export async function recordAiUsage(companyId: unknown, feature: unknown, units: unknown = 1, now: Date = new Date()): Promise<void> {
  if (typeof companyId !== "string" || !companyId || typeof feature !== "string" || !feature || feature.length > 60) return;
  const u = typeof units === "number" && Number.isFinite(units) && units >= 1 ? Math.min(Math.floor(units), 1000) : 1;
  try {
    const day = ukDay(now);
    await prisma.aiUsageDay.upsert({
      where: { companyId_day_feature: { companyId, day, feature } },
      create: { companyId, day, feature, requests: 1, units: u },
      update: { requests: { increment: 1 }, units: { increment: u } },
    });
  } catch (err) {
    console.error("Could not record AI usage:", err);
  }
}

export type UsageRow = { day: string; feature: string; requests: number; units: number };
export async function loadAiUsage(companyId: string, days: number, now: Date = new Date()): Promise<UsageRow[]> {
  const span = Math.max(1, Math.min(Math.floor(days) || 30, 366));
  const since = ukDay(new Date(now.getTime() - (span - 1) * 86_400_000));
  const rows = await prisma.aiUsageDay.findMany({ where: { companyId, day: { gte: since } }, select: { day: true, feature: true, requests: true, units: true }, orderBy: { day: "asc" } });
  return rows as UsageRow[];
}

export type UsageSummary = {
  totalRequests: number;
  totalUnits: number;
  byFeature: { feature: string; label: string; requests: number; units: number; lastDay: string }[];
  byDay: { day: string; requests: number }[]; // every day of the period, including days with none
  busiest: { day: string; requests: number } | null;
};
// the rows as totals per feature (most used first) and per day (with the quiet days filled in as zero)
export function summariseUsage(rows: UsageRow[], days: number, now: Date = new Date()): UsageSummary {
  const span = Math.max(1, Math.min(Math.floor(days) || 30, 366));
  const clean = (Array.isArray(rows) ? rows : []).filter((r) => r && typeof r.day === "string" && typeof r.feature === "string" && Number.isFinite(r.requests) && r.requests >= 0);
  const feat = new Map<string, { requests: number; units: number; lastDay: string }>();
  const perDay = new Map<string, number>();
  for (const r of clean) {
    const f = feat.get(r.feature) ?? { requests: 0, units: 0, lastDay: "" };
    f.requests += r.requests; f.units += Number.isFinite(r.units) ? r.units : 0; if (r.day > f.lastDay) f.lastDay = r.day;
    feat.set(r.feature, f);
    perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.requests);
  }
  const byDay: { day: string; requests: number }[] = [];
  for (let i = span - 1; i >= 0; i--) { const d = ukDay(new Date(now.getTime() - i * 86_400_000)); byDay.push({ day: d, requests: perDay.get(d) ?? 0 }); }
  const byFeature = [...feat.entries()].map(([feature, v]) => ({ feature, label: featureLabel(feature), ...v })).sort((a, b) => b.requests - a.requests || a.label.localeCompare(b.label));
  const busiest = byDay.reduce<{ day: string; requests: number } | null>((best, d) => (d.requests > 0 && (!best || d.requests > best.requests) ? d : best), null);
  return { totalRequests: byFeature.reduce((n, f) => n + f.requests, 0), totalUnits: byFeature.reduce((n, f) => n + f.units, 0), byFeature, byDay, busiest };
}
