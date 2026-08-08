import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn("STRIPE_SECRET_KEY is not set — billing features will not work until it's configured.");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2026-07-29.dahlia",
});

// Price IDs for each tier — created in the Stripe Dashboard, not something we generate.
// Set these once real Stripe Products/Prices exist (see the setup walkthrough).
export const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export const TRIAL_PERIOD_DAYS = 28;
