import { prisma } from "@/lib/prisma";

// What the team has used the AI features for. COUNTS ONLY: how many requests, on which day, for which feature. No prompts, photos or answers are
// kept here. It deliberately shows no money: prices change and differ by model, and a figure that is out of date is worse than none.

import { ukDay, type UsageRow } from "./aiUsageSummary";
export * from "./aiUsageSummary";

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

export async function loadAiUsage(companyId: string, days: number, now: Date = new Date()): Promise<UsageRow[]> {
  const span = Math.max(1, Math.min(Math.floor(days) || 30, 366));
  const since = ukDay(new Date(now.getTime() - (span - 1) * 86_400_000));
  const rows = await prisma.aiUsageDay.findMany({ where: { companyId, day: { gte: since } }, select: { day: true, feature: true, requests: true, units: true }, orderBy: { day: "asc" } });
  return rows as UsageRow[];
}

