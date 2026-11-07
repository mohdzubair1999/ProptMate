import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import { createBillingPortalSession } from "@/lib/actions/billing";

const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  scale: "Scale",
  enterprise: "Enterprise",
};

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  trialing: { label: "Free trial", className: "bg-signal/10 text-signal" },
  active: { label: "Active", className: "bg-verified/10 text-verified" },
  past_due: { label: "Payment failed — action needed", className: "bg-red-100 text-red-700" },
  canceled: { label: "Cancelled", className: "bg-slate/10 text-slate" },
  incomplete: { label: "Incomplete", className: "bg-signal/10 text-signal" },
  complimentary: { label: "Complimentary access", className: "bg-verified/10 text-verified" },
};

export default async function BillingPage() {
  const session = await getSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const companyId = (session?.user as any)?.companyId as string | null;

  if (!isAdmin) {
    return (
      <main>
        <h1 className="font-display font-700 text-2xl text-ink">Billing</h1>
        <p className="text-sm text-slate mt-4">Only an Admin can view or manage billing for your company.</p>
      </main>
    );
  }

  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId } }) : null;
  const status = company?.subscriptionStatus ? STATUS_LABELS[company.subscriptionStatus] : null;

  return (
    <main>
      <h1 className="font-display font-700 text-2xl text-ink">Billing</h1>

      {!company?.stripeSubscriptionId && company?.subscriptionStatus !== "complimentary" ? (
        <div className="mt-6 bg-white border border-line rounded-xl p-6">
          <p className="text-sm text-slate">You haven't started a subscription yet.</p>
          <a href="/signup/billing" className="inline-block mt-3 bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            Choose a plan
          </a>
        </div>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl p-6 max-w-lg">
          <div className="flex items-center gap-2">
            <p className="font-display font-600 text-lg text-ink">{company.planTier ? PLAN_NAMES[company.planTier] || company.planTier : "—"} plan</p>
            {status && <span className={`text-xs px-2 py-1 rounded-full ${status.className}`}>{status.label}</span>}
          </div>

          {company.subscriptionStatus === "trialing" && company.trialEndsAt && (
            <p className="text-sm text-slate mt-2">
              Your free trial ends {formatDate(company.trialEndsAt)}. Your card will be charged automatically unless you cancel before then.
            </p>
          )}

          {company.subscriptionStatus === "past_due" && (
            <p className="text-sm text-red-600 mt-2">
              Your last payment didn't go through. Update your payment method to avoid losing access.
            </p>
          )}

          {company.subscriptionStatus === "canceled" && (
          <p className="text-sm text-slate mt-2">Your subscription has been cancelled.</p>
          )}

          {company.subscriptionStatus === "complimentary" ? (
            <p className="text-sm text-slate mt-4">This account has complimentary access — no billing setup needed.</p>
          ) : (
            <>
              <form action={createBillingPortalSession} className="mt-4">
                <button type="submit" className="border border-line text-ink px-5 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors">
                  Manage billing
                </button>
              </form>
              <p className="text-xs text-slate mt-2">Update your card, view invoices, or cancel — handled securely by Stripe.</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
