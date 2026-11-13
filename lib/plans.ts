// The plans, in ONE place: the public pricing page, the plan picker at sign-up and the Billing page all read this, so they cannot disagree. The prices are what is shown when Stripe's own
// price cannot be read; when it can, Stripe's amount is shown (it is what a customer is actually charged). No server code in here, so the browser can use it too.
export type PlanTier = "starter" | "growth" | "scale" | "enterprise";
export type Plan = { tier: PlanTier; name: string; price: number; propertyLimit: number; features: string[]; popular?: boolean };

export const TRIAL_DAYS = 28;

export const PLANS: Plan[] = [
  { tier: "starter", name: "Starter", price: 25, propertyLimit: 30, features: ["Unlimited inspections", "AI photo analysis", "Compliance tracking", "1 team member"] },
  { tier: "growth", name: "Growth", price: 49, propertyLimit: 100, features: ["Everything in Starter", "Self-service tenant portal", "Cross-report comparison", "5 team members"], popular: true },
  { tier: "scale", name: "Scale", price: 99, propertyLimit: 300, features: ["Everything in Growth", "Priority support", "Unlimited team members"] },
  { tier: "enterprise", name: "Enterprise", price: 149, propertyLimit: 400, features: ["Everything in Scale", "Dedicated onboarding", "Custom contract terms"] },
];

export const PLAN_NAMES: Record<string, string> = Object.fromEntries(PLANS.map((p) => [p.tier, p.name]));

export type LivePrice = { amountMinor: number; currency: string };
export type DisplayPlan = Plan & { limit: string; priceText: string; fromStripe: boolean };

// 25 -> "£25", 24.99 -> "£24.99"
export function formatMoney(pounds: number): string {
  if (!Number.isFinite(pounds) || pounds < 0) return "";
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
}

// The plans as they should be shown: Stripe's monthly amount in pounds when it is known and sensible, otherwise the listed price
export function displayPlans(live?: Record<string, LivePrice | undefined> | null): DisplayPlan[] {
  return PLANS.map((p) => {
    const l = live?.[p.tier];
    const usable = !!l && l.currency === "gbp" && Number.isInteger(l.amountMinor) && l.amountMinor > 0 && l.amountMinor < 10_000_000;
    const price = usable ? l!.amountMinor / 100 : p.price;
    return { ...p, price, limit: `Up to ${p.propertyLimit} properties`, priceText: formatMoney(price), fromStripe: usable };
  });
}
