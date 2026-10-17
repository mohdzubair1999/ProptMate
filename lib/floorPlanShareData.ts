import { prisma } from "@/lib/prisma";
import { SHARE_TOKEN_RE, type SharedPlan } from "./floorPlanShare";

// Looks a plan up by its share token. A malformed token never reaches the database; an unknown or switched-off one
// simply returns null, the same as one that never existed - nothing here says which.
export async function loadSharedPlan(token: unknown): Promise<SharedPlan | null> {
  if (typeof token !== "string" || !SHARE_TOKEN_RE.test(token)) return null;
  const plan = await prisma.floorPlan.findFirst({
    where: { shareToken: token },
    select: {
      levels: { orderBy: { order: "asc" }, select: { name: true, sheetData: true } },
      property: { select: { address: true, company: { select: { name: true, website: true, logoData: true } } } },
    },
  });
  if (!plan) return null;
  return {
    address: plan.property.address,
    companyName: plan.property.company.name,
    website: plan.property.company.website ?? null,
    logo: plan.property.company.logoData ?? null,
    levels: plan.levels.map((l: { name: string; sheetData: string | null }) => ({ name: l.name, sheetData: l.sheetData })),
  };
}
