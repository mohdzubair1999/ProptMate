// One-time setup — creates the Starter/Growth/Scale Products and monthly Prices in your
// Stripe account, then prints the Price IDs to paste into your .env file.
// Run with: node --env-file=.env scripts/setup-stripe-products.js

const Stripe = require("stripe");

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set in your .env file.");
    process.exit(1);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });

  const plans = [
    { tier: "starter", name: "ProptMate Starter", description: "Up to 30 properties", amount: 2500 },
    { tier: "growth", name: "ProptMate Growth", description: "Up to 100 properties", amount: 4900 },
    { tier: "scale", name: "ProptMate Scale", description: "Up to 300 properties", amount: 9900 },
    { tier: "enterprise", name: "ProptMate Enterprise", description: "Up to 400 properties", amount: 14900 },
  ];

  console.log("Creating products and prices in Stripe...\n");
  const results = [];

  for (const plan of plans) {
    const product = await stripe.products.create({ name: plan.name, description: plan.description });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.amount,
      currency: "gbp",
      recurring: { interval: "month" },
    });
    results.push({ tier: plan.tier, priceId: price.id, amount: plan.amount / 100 });
    console.log(`✓ ${plan.name}: £${plan.amount / 100}/month — ${price.id}`);
  }

  console.log("\nAdd these lines to your .env file:\n");
  for (const r of results) {
    console.log(`STRIPE_PRICE_${r.tier.toUpperCase()}="${r.priceId}"`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
