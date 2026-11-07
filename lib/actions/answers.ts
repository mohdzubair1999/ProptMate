"use server";

import { scopeCompanyId, inspectionAccess } from "@/lib/access";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Plain-argument version for auto-save, called directly from a client component rather than
// via a form submission. Deliberately skips revalidatePath — that would re-render the whole
// page mid-typing, which is disruptive. The saved value already lives in the client's own
// state, so a full refresh isn't needed until the user next navigates.
// The longest answer that will be stored. Generous (a long rich-text comment fits easily), but not unlimited.
const MAX_ANSWER_CHARS = 100_000;

// An answer may only be saved against a field that belongs to THIS inspection's own template, and must be reasonable text. Without
// this, any signed-in person could write answers against fields from other templates, or store an enormous value. (An inspection
// with no template, which has no fields to check, is left as it was.)
async function assertAnswerAllowed(inspection: { templateId?: string | null }, fieldId: string, value: unknown) {
  if (typeof value !== "string") throw new Error("That answer isn't valid");
  if (value.length > MAX_ANSWER_CHARS) throw new Error("That answer is too long");
  if (inspection.templateId) {
    const field = await prisma.templateField.findFirst({ where: { id: fieldId, section: { templateId: inspection.templateId } }, select: { id: true } });
    if (!field) throw new Error("Field not found");
  }
}

export async function saveFieldValue(inspectionId: string, fieldId: string, value: string) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not authenticated");

  if (!inspectionId || !fieldId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, ...inspectionAccess(session.user as any) },
  });
  if (!inspection) throw new Error("Inspection not found");
  await assertAnswerAllowed(inspection, fieldId, value);

  await prisma.fieldAnswer.upsert({
    where: { inspectionId_fieldId: { inspectionId, fieldId } },
    update: { value },
    create: { inspectionId, fieldId, value },
  });
}

export async function saveAnswer(formData: FormData) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const inspectionId = String(formData.get("inspectionId") || "");
  const fieldId = String(formData.get("fieldId") || "");
  const value = String(formData.get("value") || "");

  if (!inspectionId || !fieldId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, ...inspectionAccess(session.user as any) },
  });
  if (!inspection) throw new Error("Inspection not found");
  await assertAnswerAllowed(inspection, fieldId, value);

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
    where: { id: inspectionId, property: { companyId: scopeCompanyId(companyId) }, deletedAt: null },
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
