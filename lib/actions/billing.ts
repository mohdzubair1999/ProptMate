"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { stripe, PLAN_PRICE_IDS, TRIAL_PERIOD_DAYS } from "@/lib/stripe";

// Creates (or reuses) a Stripe Customer for the company, then starts an Embedded Checkout
// session for a subscription with a 14-day trial. Stripe Checkout collects the card as part
// of the payment page itself — the card is saved and validated but not charged until the
// trial ends, which is exactly the "require a card upfront" behaviour we want.
export async function createCheckoutSession(planTier: string) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) throw new Error("No company associated with this account");

  const priceId = PLAN_PRICE_IDS[planTier];
  if (!priceId) throw new Error(`No price configured for plan "${planTier}"`);

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Company not found");

  let stripeCustomerId = company.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: session.user.email || undefined,
      name: company.name,
      metadata: { companyId },
    });
    stripeCustomerId = customer.id;
    await prisma.company.update({ where: { id: companyId }, data: { stripeCustomerId } });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    ui_mode: "embedded_page", // Stripe retired the "embedded" value in March 2026 — this is
    // the confirmed current replacement, not a guess.
    mode: "subscription",
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      trial_period_days: TRIAL_PERIOD_DAYS,
      metadata: { companyId, planTier },
    },
    metadata: { companyId, planTier },
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing?checkout=complete`,
  });

  return { clientSecret: checkoutSession.client_secret };
}

// Sends the company to Stripe's own hosted portal to update their card, view invoices, or
// cancel — same reasoning as Checkout: Stripe hosts the page, we never touch payment details.
export async function createBillingPortalSession() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) throw new Error("No company associated with this account");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.stripeCustomerId) throw new Error("No billing account found for this company yet");

  let portalSession;
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: company.stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings/billing`,
    });
  } catch (err: any) {
    // Most likely cause: the stored customer ID no longer exists in Stripe (e.g. deleted
    // while testing) — give a clear message instead of an opaque Stripe API error.
    if (err?.code === "resource_missing") {
      throw new Error("Your billing account couldn't be found in Stripe — please contact support.");
    }
    throw err;
  }

  redirect(portalSession.url);
}
