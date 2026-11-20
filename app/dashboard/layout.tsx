import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Sidebar from "./sidebar";
import MobileTabBar from "./mobile-tab-bar";
import MobileFab from "./mobile-fab";
import OfflineSyncIndicator from "@/components/OfflineSyncIndicator";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const role = ((session.user as any).role as string) || "INSPECTOR";
  if (role === "CLIENT") redirect("/portal");

  const email = session.user.email || "";
  const companyId = (session.user as any).companyId as string | null;

  const company = companyId
    ? await prisma.company.findUnique({ where: { id: companyId }, select: { subscriptionStatus: true } })
    : null;

  // Only hard-block on an EXPLICITLY cancelled subscription. Companies with no subscription
  // status at all (created before billing existed, or mid-trial-setup) are deliberately left
  // alone here — treating "never subscribed" the same as "cancelled" would lock out every
  // company that predates this feature, which is not the intent.
  if (company?.subscriptionStatus === "canceled") {
    redirect("/subscription-ended");
  }

  return (
    <div className="flex min-h-screen bg-paper">
      <Sidebar email={email} role={role} />
      <div className="flex-1 min-w-0 px-6 sm:px-10 py-10 pb-40 md:pb-10">
        {company?.subscriptionStatus === "past_due" && <PastDueBanner />}
        {children}
      </div>
      <MobileFab />
      <MobileTabBar />
      <OfflineSyncIndicator />
    </div>
  );
}

function PastDueBanner() {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 mb-6">
      Your last payment didn't go through.{" "}
      <a href="/dashboard/settings/billing" className="underline font-medium">
        Update your payment method
      </a>{" "}
      to avoid losing access.
    </div>
  );
}
