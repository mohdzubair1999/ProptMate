import { getStripe, PLAN_PRICE_IDS } from "./stripe";
import { PLANS, type LivePrice } from "./plans";

// What each plan really costs, read from Stripe (the price a customer is charged). Never throws: with Stripe not set up, a missing price or any error, that plan is simply left out
// and the listed price is shown instead. Kept for ten minutes so a busy page does not call Stripe on every visit.
let cache: { at: number; data: Record<string, LivePrice> } | null = null;

export async function getLivePrices(): Promise<Record<string, LivePrice>> {
  if (cache && Date.now() - cache.at < 10 * 60_000) return cache.data;
  const out: Record<string, LivePrice> = {};
  try {
    const stripe = getStripe();
    await Promise.all(
      PLANS.map(async (p) => {
        const id = PLAN_PRICE_IDS[p.tier];
        if (!id) return;
        try {
          const pr = await stripe.prices.retrieve(id);
          if (pr.active && pr.type === "recurring" && pr.recurring?.interval === "month" && pr.recurring.interval_count === 1 && typeof pr.unit_amount === "number") out[p.tier] = { amountMinor: pr.unit_amount, currency: pr.currency };
        } catch {
          /* this plan keeps its listed price */
        }
      }),
    );
  } catch {
    /* Stripe is not configured here: every plan keeps its listed price */
  }
  cache = { at: Date.now(), data: out };
  return out;
}
