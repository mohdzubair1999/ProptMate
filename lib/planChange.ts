// What to do when a company's plan changes in Stripe: work out which plan the price belongs to, whether it went down, and what to tell the account owner.
// No database or network code here, so it can be tested.
import { PLANS } from "@/lib/plans";
import { propertyLimitFor, teamLimitFor } from "@/lib/planLimits";

const RANK: Record<string, number> = Object.fromEntries(PLANS.map((p, i) => [p.tier, i]));

// Which plan a Stripe price id belongs to, using the STRIPE_PRICE_* settings. null when it is not one of ours.
export function tierForPriceId(priceId: unknown, prices: Record<string, string | undefined>): string | null {
  if (typeof priceId !== "string" || !priceId) return null;
  for (const [tier, id] of Object.entries(prices)) if (id && id === priceId && tier in RANK) return tier;
  return null;
}

export type PlanDirection = "upgrade" | "downgrade" | "same" | "unknown";
export function planDirection(from: string | null | undefined, to: string | null | undefined): PlanDirection {
  if (!from || !to || !(from in RANK) || !(to in RANK)) return "unknown";
  if (from === to) return "same";
  return RANK[to] > RANK[from] ? "upgrade" : "downgrade";
}

export type OverLimit = { properties: { used: number; limit: number } | null; team: { used: number; limit: number } | null };
export function overLimit(planTier: string | null | undefined, properties: number, team: number): OverLimit {
  const pl = propertyLimitFor(planTier), tl = teamLimitFor(planTier);
  return {
    properties: pl !== null && properties > pl ? { used: properties, limit: pl } : null,
    team: tl !== null && team > tl ? { used: team, limit: tl } : null,
  };
}

// A downgrade is always worth telling the owner about. Being over the new limits makes the email firmer; nothing is ever deleted.
export function shouldEmailPlanChange(direction: PlanDirection): boolean { return direction === "downgrade"; }

export function planChangeEmail(opts: { companyName: string; fromTier: string; toTier: string; over: OverLimit }): { subject: string; lines: string[] } {
  const name = (t: string) => PLANS.find((p) => p.tier === t)?.name ?? t;
  const to = name(opts.toTier);
  const lines = [`Hello,`, "", `${opts.companyName} has moved from the ${name(opts.fromTier)} plan to the ${to} plan on ProptMate.`, "", "What this means:", "- Nothing has been deleted. Every property, inspection and report is still there.", `- The ${to} plan allows ${propertyLimitFor(opts.toTier) ?? "unlimited"} active properties and ${teamLimitFor(opts.toTier) ?? "unlimited"} team member${teamLimitFor(opts.toTier) === 1 ? "" : "s"}.`];
  const { properties, team } = opts.over;
  if (properties || team) {
    lines.push("", "Your account is currently over the new limits:");
    if (properties) lines.push(`- ${properties.used} active properties, and the plan allows ${properties.limit}. You will not be able to add or restore properties until you are at or under ${properties.limit}.`);
    if (team) lines.push(`- ${team.used} team members, and the plan allows ${team.limit}. You will not be able to add team members until you are at or under ${team.limit}.`);
    lines.push("", "You can get back under the limit by archiving properties you no longer manage (Properties, then Archive), or by upgrading again under Settings, Billing. Archived properties keep all their history.");
  } else {
    lines.push("- You are within the new limits, so you do not need to do anything.");
  }
  lines.push("", "If you did not make this change, or you would like to talk it through, just reply to this email.", "", "The ProptMate team");
  return { subject: properties || team ? `Your ProptMate plan has changed - action needed (${opts.companyName})` : `Your ProptMate plan has changed (${opts.companyName})`, lines };
}
