import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import BillingCheckout from "./billing-checkout";

export default async function SignupBillingPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const companyId = (session.user as any).companyId as string | null;
  if (companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { stripeSubscriptionId: true, subscriptionStatus: true } });
    // Already has a real subscription (anything other than cancelled) — don't show the plan
    // picker again, since choosing a plan here always creates a NEW Stripe subscription and
    // this could otherwise double-bill someone who lands back on this page a second time.
    if (company?.stripeSubscriptionId && company.subscriptionStatus !== "canceled") {
      redirect("/dashboard");
    }
  }

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-6xl">
        <h1 className="font-display font-700 text-3xl text-ink text-center">Choose your plan</h1>
        <p className="text-sm text-slate text-center mt-2">28-day free trial on any plan — cancel anytime before it ends and you won't be charged.</p>
        <div className="mt-10">
          <BillingCheckout />
        </div>
      </div>
    </main>
  );
}
