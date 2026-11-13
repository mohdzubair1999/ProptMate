import { prisma } from "@/lib/prisma";
import { SHARE_TOKEN_RE, type SharedPlan } from "./floorPlanShare";

// Looks a plan up by its share token. A malformed token never reaches the database; an unknown or switched-off one
// simply returns null, the same as one that never existed - nothing here says which.
export async function loadSharedPlan(token: unknown): Promise<SharedPlan | null> {
  if (typeof token !== "string" || !SHARE_TOKEN_RE.test(token)) return null;
  const plan = await prisma.floorPlan.findFirst({
    // a link past its expiry is found by nothing, so it looks exactly like one that never existed
    where: { shareToken: token, OR: [{ shareExpiresAt: null }, { shareExpiresAt: { gt: new Date() } }] },
    select: {
      levels: { orderBy: { order: "asc" }, select: { name: true, sheetData: true } },
      property: { select: { address: true, company: { select: { name: true, website: true, logoData: true } } } },
    },
  });
  if (!plan) return null;
  // Recorded only for a link that WORKS (an unknown or expired one finds nothing above). It never gets in the way of showing the plan: if
  // the count cannot be saved, the plan is shown anyway. It counts every open of the page or its PDF, including the owner's own and link-preview bots.
  try {
    await prisma.floorPlan.updateMany({ where: { shareToken: token }, data: { shareViewCount: { increment: 1 }, shareLastViewedAt: new Date() } });
  } catch (err) {
    console.error("Could not record a view of a shared plan:", err);
  }
  return {
    address: plan.property.address,
    companyName: plan.property.company.name,
    website: plan.property.company.website ?? null,
    logo: plan.property.company.logoData ?? null,
    levels: plan.levels.map((l: { name: string; sheetData: string | null }) => ({ name: l.name, sheetData: l.sheetData })),
  };
}
