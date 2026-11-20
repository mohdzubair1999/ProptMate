import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { prisma } from "@/lib/prisma";
import type Stripe from "stripe";
import { PLAN_PRICE_IDS } from "@/lib/stripe";
import { overLimit, planChangeEmail, planDirection, shouldEmailPlanChange, tierForPriceId } from "@/lib/planChange";
import { planUsage } from "@/lib/planLimitsDb";
import { sendPlainEmail } from "@/lib/sendEmail";
import { getMainAdminEmail } from "@/lib/getMainAdminEmail";

// Stripe needs a static, publicly reachable URL to POST events to — this can't be a Server
// Action, only a real Route Handler works here. This is the actual source of truth for
// subscription status: never rely on the browser's post-checkout redirect alone, since a
// closed tab or dropped connection means the redirect never happens even though payment
// succeeded — the webhook fires regardless.
export async function POST(req: Request) {
  const body = await req.text(); // raw body required for signature verification, not parsed JSON
  const signature = req.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature or webhook secret" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const companyId = session.metadata?.companyId;
        const planTier = session.metadata?.planTier;
        if (companyId && session.subscription) {
          await prisma.company.update({
            where: { id: companyId },
            data: {
              stripeSubscriptionId: String(session.subscription),
              subscriptionStatus: "trialing",
              planTier: planTier || undefined,
            },
          });
        }
        break;
      }

      // Covers trial ending -> active, plan changes, past_due, and other status transitions
      // over the life of the subscription.
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        if (companyId) {
          // Follow the plan the customer is really on (a change made in Stripe's billing portal changes the price, not our own record).
          const newTier = tierForPriceId(subscription.items?.data?.[0]?.price?.id, PLAN_PRICE_IDS);
          const before = newTier ? await prisma.company.findUnique({ where: { id: companyId }, select: { planTier: true, name: true } }) : null;
          await prisma.company.update({
            where: { id: companyId },
            data: { subscriptionStatus: subscription.status, stripeSubscriptionId: subscription.id, ...(newTier ? { planTier: newTier } : {}) },
          });
          if (newTier && before?.planTier && shouldEmailPlanChange(planDirection(before.planTier, newTier))) {
            try {
              const usage = await planUsage(companyId);
              const mail = planChangeEmail({ companyName: before.name, fromTier: before.planTier, toTier: newTier, over: overLimit(newTier, usage.properties, usage.team) });
              const to = await getMainAdminEmail(companyId);
              if (to) await sendPlainEmail([to], mail.subject, mail.lines);
            } catch (err) { console.error("Plan-change email failed (the plan itself was updated):", err); }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const companyId = subscription.metadata?.companyId;
        if (companyId) {
          await prisma.company.update({ where: { id: companyId }, data: { subscriptionStatus: "canceled" } });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription;
        if (subscriptionId) {
          const company = await prisma.company.findFirst({ where: { stripeSubscriptionId: String(subscriptionId) } });
          if (company) {
            await prisma.company.update({ where: { id: company.id }, data: { subscriptionStatus: "past_due" } });
          }
        }
        break;
      }

      default:
        // Not every event type needs handling — anything else is safely ignored.
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries delivery — don't swallow processing errors as if they succeeded.
    console.error("Error processing Stripe webhook:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
