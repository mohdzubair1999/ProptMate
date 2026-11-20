import Link from "next/link";
import { planUsage } from "@/lib/planLimitsDb";
import { propertyLimitFor, usageLevel } from "@/lib/planLimits";
import { PLANS } from "@/lib/plans";

// A heads-up on the dashboard and Properties page when the company is close to (or at) its property limit. Silent for everyone else.
export default async function PlanUsageBanner({ companyId }: { companyId: string | null | undefined }) {
  if (!companyId) return null;
  const u = await planUsage(companyId);
  const limit = propertyLimitFor(u.planTier);
  const level = usageLevel(u.properties, limit);
  if (level === "ok" || limit === null) return null;
  const plan = PLANS.find((p) => p.tier === u.planTier)?.name ?? "current";
  return (
    <div className={`text-sm rounded-xl px-4 py-3 mb-6 border ${level === "full" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-800"}`} data-testid="plan-usage-banner" data-level={level}>
      {level === "full"
        ? `You are using all ${limit} properties on your ${plan} plan, so you can't add more. `
        : `You are using ${u.properties} of ${limit} properties on your ${plan} plan. `}
      Archive properties you no longer manage, or{" "}
      <Link href="/dashboard/settings/billing" className="underline font-medium">upgrade your plan</Link>.
    </div>
  );
}
