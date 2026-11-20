// What each plan allows, in ONE place, with no database or server code so it can be tested and used anywhere.
// A company with NO plan recorded (or one this list does not know) is never restricted: it is only ever a plan we can read that limits anyone.
import { PLANS } from "@/lib/plans";

const TEAM_LIMITS: Record<string, number | null> = { starter: 1, growth: 5, scale: null, enterprise: null };

// the number of active (not archived) properties the plan allows, or null for "no limit"
export function propertyLimitFor(planTier: string | null | undefined): number | null {
  const plan = PLANS.find((p) => p.tier === planTier);
  return plan ? plan.propertyLimit : null;
}

// the number of team members (every staff account in the company, whatever the role) the plan allows, or null for "no limit"
export function teamLimitFor(planTier: string | null | undefined): number | null {
  const t = typeof planTier === "string" ? planTier : "";
  return Object.prototype.hasOwnProperty.call(TEAM_LIMITS, t) ? TEAM_LIMITS[t] : null;
}

// How close the company is to its property limit: "full" at the limit, "near" from 80%, otherwise "ok" (and always "ok" when there is no limit)
export type UsageLevel = "ok" | "near" | "full";
export function usageLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null || !Number.isFinite(limit) || limit <= 0) return "ok";
  const u = Number.isFinite(used) && used > 0 ? used : 0;
  if (u >= limit) return "full";
  return u >= Math.ceil(limit * 0.8) ? "near" : "ok";
}

export type LimitResult = { ok: true; limit: number | null; remaining: number | null } | { ok: false; limit: number; remaining: 0; message: string };

function plural(n: number, one: string, many: string): string { return `${n} ${n === 1 ? one : many}`; }

// can the company add `adding` more properties when it already has `activeCount` active ones?
export function checkPropertyLimit(planTier: string | null | undefined, activeCount: number, adding: number = 1): LimitResult {
  const limit = propertyLimitFor(planTier);
  const count = Number.isFinite(activeCount) && activeCount > 0 ? Math.floor(activeCount) : 0;
  const add = Number.isFinite(adding) && adding > 0 ? Math.floor(adding) : 0;
  if (limit === null) return { ok: true, limit: null, remaining: null };
  const remaining = Math.max(0, limit - count);
  if (count + add <= limit) return { ok: true, limit, remaining: remaining - add };
  const name = PLANS.find((p) => p.tier === planTier)?.name ?? "current";
  const message = add > 1
    ? `Your ${name} plan allows ${plural(limit, "property", "properties")} and you have ${count}, so ${plural(add, "more", "more")} won't fit (room for ${remaining}). Archive properties you no longer manage, or upgrade your plan under Settings, Billing.`
    : `Your ${name} plan allows ${plural(limit, "property", "properties")} and you are using all of them. Archive a property you no longer manage to free a place, or upgrade your plan under Settings, Billing.`;
  return { ok: false, limit, remaining: 0, message };
}

// can the company add one more team member when it already has `memberCount`?
export function checkTeamLimit(planTier: string | null | undefined, memberCount: number, adding: number = 1): LimitResult {
  const limit = teamLimitFor(planTier);
  const count = Number.isFinite(memberCount) && memberCount > 0 ? Math.floor(memberCount) : 0;
  const add = Number.isFinite(adding) && adding > 0 ? Math.floor(adding) : 0;
  if (limit === null) return { ok: true, limit: null, remaining: null };
  if (count + add <= limit) return { ok: true, limit, remaining: limit - count - add };
  const name = PLANS.find((p) => p.tier === planTier)?.name ?? "current";
  return { ok: false, limit, remaining: 0, message: `Your ${name} plan allows ${plural(limit, "team member", "team members")} and you have ${count}. Remove someone you no longer need, or upgrade your plan under Settings, Billing.` };
}
