// Updates pricing for the 3 existing tiers (Stripe prices can't be edited once created, so
// this creates new prices and deactivates the old ones — anyone already subscribed keeps
// their existing price, nobody gets silently repriced), and adds a new Enterprise tier.
// Run with: node --env-file=.env scripts/update-stripe-pricing.js

const Stripe = require("stripe");

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set in your .env file.");
    process.exit(1);
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-07-29.dahlia" });

  const updates = [
    { productName: "ProptMate Starter", tier: "starter", newAmount: 2500, description: "Up to 30 properties" },
    { productName: "ProptMate Growth", tier: "growth", newAmount: 4900, description: "Up to 100 properties" },
    { productName: "ProptMate Scale", tier: "scale", newAmount: 9900, description: "Up to 300 properties" },
  ];

  const results = [];

  console.log("Updating existing tiers...\n");
  for (const u of updates) {
    const products = await stripe.products.search({ query: `name:'${u.productName}'` });
    const product = products.data[0];
    if (!product) {
      console.log(`⚠ Couldn't find an existing product named "${u.productName}" — skipping. Check the name matches what setup-stripe-products.js created.`);
      continue;
    }

    // Retire the old price so it can't be selected for new subscriptions, without touching
    // anyone already on it.
    const oldPrices = await stripe.prices.list({ product: product.id, active: true });
    for (const oldPrice of oldPrices.data) {
      await stripe.prices.update(oldPrice.id, { active: false });
    }

    const newPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: u.newAmount,
      currency: "gbp",
      recurring: { interval: "month" },
    });

    await stripe.products.update(product.id, { description: u.description });

    results.push({ tier: u.tier, priceId: newPrice.id, amount: u.newAmount / 100 });
    console.log(`✓ ${u.productName}: now £${u.newAmount / 100}/month — ${newPrice.id}`);
  }

  console.log("\nCreating new Enterprise tier...\n");
  const enterpriseProduct = await stripe.products.create({
    name: "ProptMate Enterprise",
    description: "Up to 400 properties",
  });
  const enterprisePrice = await stripe.prices.create({
    product: enterpriseProduct.id,
    unit_amount: 14900,
    currency: "gbp",
    recurring: { interval: "month" },
  });
  results.push({ tier: "enterprise", priceId: enterprisePrice.id, amount: 149 });
  console.log(`✓ ProptMate Enterprise: £149/month — ${enterprisePrice.id}`);

  console.log("\nUpdate these lines in your .env file:\n");
  for (const r of results) {
    console.log(`STRIPE_PRICE_${r.tier.toUpperCase()}="${r.priceId}"`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
