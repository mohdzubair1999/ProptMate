import { prisma } from "@/lib/prisma";
import { sortJobs, type JobView } from "@/lib/maintenanceTracking";

type Row = { id: string; urgency: string; timeframe: string; area: string; text: string; status: string; createdAt: Date; resolvedAt: Date | null; resolvedInspectionId: string | null; lastSeenInspectionId: string | null; lastSeenAt: Date | null };
const view = (r: Row): JobView => ({ id: r.id, urgency: r.urgency, timeframe: r.timeframe, area: r.area, text: r.text, status: r.status, createdAt: r.createdAt.toISOString(), resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null, resolvedInspectionId: r.resolvedInspectionId ?? null, lastSeenInspectionId: r.lastSeenInspectionId ?? null, lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null });
const SELECT = { id: true, urgency: true, timeframe: true, area: true, text: true, status: true, createdAt: true, resolvedAt: true, resolvedInspectionId: true, lastSeenInspectionId: true, lastSeenAt: true } as const;

// every tracked job for a property (newest 200), for the property page; limited to the company through the property
export async function loadPropertyJobs(propertyId: string, companyId: string | null | undefined): Promise<JobView[]> {
  if (!companyId || !propertyId) return [];
  const rows = await prisma.maintenanceJob.findMany({ where: { propertyId, property: { companyId } }, orderBy: { createdAt: "desc" }, take: 200, select: SELECT });
  return sortJobs((rows as Row[]).map(view));
}

// the property's jobs that are still open or in progress, for the checklist at the next visit (leaving out jobs found at this very visit)
export async function loadOpenJobsForVisit(propertyId: string, companyId: string | null | undefined, thisInspectionId: string): Promise<JobView[]> {
  if (!companyId || !propertyId) return [];
  const rows = await prisma.maintenanceJob.findMany({
    // not found at this very visit; written with OR so a job with no recorded source is kept (SQL's NOT (col = x) would silently drop it)
    where: { propertyId, property: { companyId }, status: { not: "done" }, OR: [{ sourceInspectionId: null }, { sourceInspectionId: { not: thisInspectionId } }] },
    orderBy: { createdAt: "asc" }, take: 100, select: SELECT,
  });
  return sortJobs((rows as Row[]).map(view));
}
