import Stripe from "stripe";

let _stripe: Stripe | null = null;

// Constructed lazily, on first actual use, rather than at module load. This module gets
// imported — and its top-level code evaluated — whenever Next.js analyzes a route that
// touches it, including during the production build itself, regardless of whether that route
// is ever actually invoked. The Stripe SDK throws if constructed with an empty API key, so
// building it unconditionally at the top of this file meant any build without
// STRIPE_SECRET_KEY set would fail outright — even though billing isn't configured in every
// environment yet, and nothing here needs the client to exist until a billing action actually
// runs.
export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set — billing features aren't configured yet.");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      // Stripe's own SDK pins this field's TYPE to whatever was "latest" when the installed
      // stripe package version was published (their own documented behavior, not a bug) -
      // so this exact line breaks the build every time a newer stripe package gets pulled in,
      // even though "2026-07-29.dahlia" is a genuinely valid, working API version at runtime.
      // `as any` here is Stripe's own recommended fix for pinning an intentional, older-but-
      // valid version: https://github.com/stripe/stripe-node#using-old-api-versions-with-typescript
      apiVersion: "2026-07-29.dahlia" as any,
    });
  }
  return _stripe;
}

// Price IDs for each tier — created in the Stripe Dashboard, not something we generate.
// Set these once real Stripe Products/Prices exist (see the setup walkthrough).
export const PLAN_PRICE_IDS: Record<string, string | undefined> = {
  starter: process.env.STRIPE_PRICE_STARTER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  scale: process.env.STRIPE_PRICE_SCALE,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export const TRIAL_PERIOD_DAYS = 28;
