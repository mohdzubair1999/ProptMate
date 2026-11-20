"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { cleanJobInputs, isJobStatus, splitNew, type JobStatus } from "@/lib/maintenanceTracking";

async function requireStaff() {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string; companyId?: string | null } | undefined;
  if (!user?.id || !user.companyId) throw new Error("Not signed in");
  return { id: user.id, role: user.role ?? "", companyId: user.companyId };
}

// Saves the jobs from an inspection's draft maintenance list against the PROPERTY, skipping any already open or in progress there.
export async function trackMaintenanceJobs(inspectionId: string, rawJobs: unknown): Promise<{ added: number; skipped: number }> {
  const user = await requireStaff();
  if (typeof inspectionId !== "string" || !inspectionId) throw new Error("Inspection not found");
  const inspection = await prisma.inspection.findFirst({ where: { id: inspectionId, deletedAt: null, property: { companyId: user.companyId } }, select: { id: true, propertyId: true } });
  if (!inspection) throw new Error("Inspection not found");
  const jobs = cleanJobInputs(rawJobs);
  if (jobs.length === 0) throw new Error("There are no jobs to track");
  const existing = await prisma.maintenanceJob.findMany({ where: { propertyId: inspection.propertyId, property: { companyId: user.companyId }, status: { not: "done" } }, select: { area: true, text: true } });
  const { fresh, skipped } = splitNew(existing, jobs);
  if (fresh.length > 0) {
    await prisma.maintenanceJob.createMany({ data: fresh.map((j) => ({ propertyId: inspection.propertyId, sourceInspectionId: inspection.id, urgency: j.urgency, timeframe: j.timeframe, area: j.area, text: j.text })) });
  }
  revalidatePath(`/dashboard/properties/${inspection.propertyId}`);
  return { added: fresh.length, skipped };
}

// The inspection a person says they are at, if it really is one of this company's live inspections of the SAME property as the job
// (so a job can never be tied to someone else's inspection, a deleted one, or a different property's)
async function visitFor(companyId: string, propertyId: string, inspectionId: unknown): Promise<string | null> {
  if (typeof inspectionId !== "string" || !inspectionId) return null;
  const found = await prisma.inspection.findFirst({ where: { id: inspectionId, deletedAt: null, propertyId, property: { companyId } }, select: { id: true } });
  return found ? found.id : null;
}

// Changes a job's status. Marking it done records when, and (if given) at which inspection; reopening it clears both.
export async function setMaintenanceJobStatus(jobId: string, status: unknown, inspectionId?: string): Promise<{ status: JobStatus; resolvedAt: string | null; resolvedInspectionId: string | null }> {
  const user = await requireStaff();
  if (!isJobStatus(status)) throw new Error("Choose open, in progress or done");
  if (typeof jobId !== "string" || !jobId) throw new Error("Job not found");
  const job = await prisma.maintenanceJob.findFirst({ where: { id: jobId, property: { companyId: user.companyId } }, select: { id: true, propertyId: true } });
  if (!job) throw new Error("Job not found");
  const resolvedAt = status === "done" ? new Date() : null;
  const resolvedInspectionId = status === "done" ? await visitFor(user.companyId, job.propertyId, inspectionId) : null;
  await prisma.maintenanceJob.update({ where: { id: job.id }, data: { status, resolvedAt, resolvedInspectionId } });
  revalidatePath(`/dashboard/properties/${job.propertyId}`);
  return { status, resolvedAt: resolvedAt ? resolvedAt.toISOString() : null, resolvedInspectionId };
}

// "Still there": records that at this visit the job was checked and is still outstanding, so the next person can see when it was last confirmed.
export async function confirmJobStillThere(jobId: string, inspectionId: string): Promise<{ lastSeenAt: string }> {
  const user = await requireStaff();
  if (typeof jobId !== "string" || !jobId) throw new Error("Job not found");
  const job = await prisma.maintenanceJob.findFirst({ where: { id: jobId, property: { companyId: user.companyId } }, select: { id: true, propertyId: true, status: true } });
  if (!job) throw new Error("Job not found");
  if (job.status === "done") throw new Error("That job is already marked done");
  const visit = await visitFor(user.companyId, job.propertyId, inspectionId);
  if (!visit) throw new Error("Inspection not found");
  const lastSeenAt = new Date();
  await prisma.maintenanceJob.update({ where: { id: job.id }, data: { lastSeenInspectionId: visit, lastSeenAt } });
  revalidatePath(`/dashboard/properties/${job.propertyId}`);
  return { lastSeenAt: lastSeenAt.toISOString() };
}

// Removes a job that was tracked by mistake. Only an Admin or Manager may: finished jobs are kept as a record.
export async function deleteMaintenanceJob(jobId: string): Promise<void> {
  const user = await requireStaff();
  if (user.role !== "ADMIN" && user.role !== "MANAGER") throw new Error("Only an Admin or Manager can remove a job");
  if (typeof jobId !== "string" || !jobId) throw new Error("Job not found");
  const job = await prisma.maintenanceJob.findFirst({ where: { id: jobId, property: { companyId: user.companyId } }, select: { id: true, propertyId: true } });
  if (!job) throw new Error("Job not found");
  await prisma.maintenanceJob.delete({ where: { id: job.id } });
  revalidatePath(`/dashboard/properties/${job.propertyId}`);
}
