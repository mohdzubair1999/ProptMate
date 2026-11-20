import { prisma } from "@/lib/prisma";
import { checkPropertyLimit, checkTeamLimit } from "@/lib/planLimits";

export class PlanLimitError extends Error {
  constructor(message: string) { super(message); this.name = "PlanLimitError"; }
}

// Active properties are the ones not archived: archiving one frees its place.
export function activePropertyCount(companyId: string): Promise<number> {
  return prisma.property.count({ where: { companyId, archivedAt: null } });
}

export async function planUsage(companyId: string) {
  const [company, properties, team] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { planTier: true } }),
    activePropertyCount(companyId),
    prisma.user.count({ where: { companyId } }),
  ]);
  return { planTier: company?.planTier ?? null, properties, team };
}

// Throws a PlanLimitError (its message is safe to show) when the company has no room for `adding` more properties.
export async function assertCanAddProperties(companyId: string, adding: number = 1): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { planTier: true } });
  const r = checkPropertyLimit(company?.planTier, await activePropertyCount(companyId), adding);
  if (!r.ok) throw new PlanLimitError(r.message);
}

export async function assertCanAddTeamMember(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { planTier: true } });
  const r = checkTeamLimit(company?.planTier, await prisma.user.count({ where: { companyId } }), 1);
  if (!r.ok) throw new PlanLimitError(r.message);
}
