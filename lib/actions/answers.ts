"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Plain-argument version for auto-save, called directly from a client component rather than
// via a form submission. Deliberately skips revalidatePath — that would re-render the whole
// page mid-typing, which is disruptive. The saved value already lives in the client's own
// state, so a full refresh isn't needed until the user next navigates.
export async function saveFieldValue(inspectionId: string, fieldId: string, value: string) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");
  const companyId = (session.user as any).companyId as string | null;

  if (!inspectionId || !fieldId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.fieldAnswer.upsert({
    where: { inspectionId_fieldId: { inspectionId, fieldId } },
    update: { value },
    create: { inspectionId, fieldId, value },
  });
}

export async function saveAnswer(formData: FormData) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;

  const inspectionId = String(formData.get("inspectionId") || "");
  const fieldId = String(formData.get("fieldId") || "");
  const value = String(formData.get("value") || "");

  if (!inspectionId || !fieldId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.fieldAnswer.upsert({
    where: { inspectionId_fieldId: { inspectionId, fieldId } },
    update: { value },
    create: { inspectionId, fieldId, value },
  });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Hides or shows a template section just for this one inspection — the template itself,
// and every other inspection using it, is unaffected.
export async function toggleSectionForInspection(formData: FormData) {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;

  const inspectionId = String(formData.get("inspectionId") || "");
  const sectionId = String(formData.get("sectionId") || "");
  if (!inspectionId || !sectionId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
  });
  if (!inspection) throw new Error("Inspection not found");

  const current: string[] = inspection.excludedSectionIds ? JSON.parse(inspection.excludedSectionIds) : [];
  const updated = current.includes(sectionId) ? current.filter((id) => id !== sectionId) : [...current, sectionId];

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { excludedSectionIds: JSON.stringify(updated) },
  });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}
