"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return {
    id: (session.user as any).id as string,
    companyId: (session.user as any).companyId as string | null,
    role: (session.user as any).role as string,
  };
}

// Destructive/structural actions (deleting properties or inspections outright) are reserved
// for Admin and Manager — an Inspector conducts and completes inspections but shouldn't be
// able to remove a whole property or inspection record.
function assertManagerOrAdmin(role: string) {
  if (role !== "ADMIN" && role !== "MANAGER") {
    throw new Error("Only an Admin or Manager can do this");
  }
}

export async function createInspection(formData: FormData) {
  const user = await requireUser();

  const propertyId = String(formData.get("propertyId") || "");
  const type = String(formData.get("type") || "check-in");
  const scheduledDateRaw = String(formData.get("scheduledDate") || "");
  const templateId = String(formData.get("templateId") || "") || null;

  if (!propertyId) throw new Error("Property is required");

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId || undefined } });
  if (!property) throw new Error("Property not found");

  const inspection = await prisma.inspection.create({
    data: {
      propertyId,
      inspectorId: user.id,
      type,
      status: "draft",
      scheduledDate: scheduledDateRaw ? new Date(scheduledDateRaw) : null,
      templateId,
    },
  });

  // Auto-fill any field whose label exactly matches something we already know about the
  // property, so the inspector isn't retyping the address by hand — narrow and explicit on
  // purpose (exact label match, only when we actually have the data) rather than a general
  // merge-tag system, since a wrong guess here would be worse than just leaving it blank.
  if (templateId) {
    const template = await prisma.template.findUnique({
      where: { id: templateId },
      include: { sections: { include: { fields: true } } },
    });

    const mergeFieldValues: Record<string, string | null> = {
      "property address": [property.address, property.city, property.postcode].filter(Boolean).join(", ") || null,
      "landlord name": property.landlordName,
    };

    const answersToCreate: { inspectionId: string; fieldId: string; value: string }[] = [];
    if (template) {
      for (const section of template.sections) {
        for (const field of section.fields) {
          if (field.type !== "TEXT" && field.type !== "SHORT_TEXT") continue;
          const value = mergeFieldValues[field.label.trim().toLowerCase()];
          if (value) answersToCreate.push({ inspectionId: inspection.id, fieldId: field.id, value });
        }
      }
    }
    if (answersToCreate.length > 0) {
      await prisma.fieldAnswer.createMany({ data: answersToCreate });
    }
  }

  revalidatePath("/dashboard/inspections");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/inspections/${inspection.id}`);
}

export async function addInspectionItem(formData: FormData) {
  await requireUser();

  const inspectionId = String(formData.get("inspectionId") || "");
  const templateFieldId = String(formData.get("templateFieldId") || "") || null;
  const room = String(formData.get("room") || "").trim();
  const itemName = String(formData.get("itemName") || "").trim();
  const condition = String(formData.get("condition") || "good");
  const make = String(formData.get("make") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!inspectionId || !room || !itemName) throw new Error("Room and item name are required");

  await prisma.inspectionItem.create({ data: { inspectionId, room, itemName, condition, make, notes, templateFieldId } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Plain-argument version for the standard-items checklist — called directly from the client
// component when an item is selected and a condition chosen, same pattern as other
// auto-save-style interactions elsewhere in the app.
export async function addInspectionItemDirect(inspectionId: string, room: string, itemName: string, condition: string, templateFieldId: string | null, make?: string) {
  await requireUser();

  if (!inspectionId || !room || !itemName) throw new Error("Room and item name are required");

  await prisma.inspectionItem.create({ data: { inspectionId, room, itemName, condition, make: make?.trim() || null, templateFieldId } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

export async function completeInspection(formData: FormData) {
  await requireUser();
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  await prisma.inspection.update({ where: { id: inspectionId }, data: { status: "completed", completedDate: new Date() } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
  revalidatePath("/dashboard/inspections");
}

export async function appendItemNotes(itemId: string, text: string, inspectionId: string) {
  await requireUser();
  if (!itemId || !text) return;

  const item = await prisma.inspectionItem.findUnique({ where: { id: itemId } });
  if (!item) return;

  const updated = item.notes ? `${item.notes}\n\n${text}` : text;
  await prisma.inspectionItem.update({ where: { id: itemId }, data: { notes: updated } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

export async function reopenInspection(formData: FormData) {
  await requireUser();
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  await prisma.inspection.update({ where: { id: inspectionId }, data: { status: "draft", completedDate: null } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
  revalidatePath("/dashboard/inspections");
}

export async function deleteInspection(formData: FormData) {
  const user = await requireUser();
  assertManagerOrAdmin(user.role);
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: user.companyId || undefined } },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.$transaction([
    prisma.photo.deleteMany({ where: { OR: [{ inspectionItem: { inspectionId } }, { fieldAnswer: { inspectionId } }] } }),
    prisma.fieldAnswer.deleteMany({ where: { inspectionId } }),
    prisma.inspectionItem.deleteMany({ where: { inspectionId } }),
    prisma.report.deleteMany({ where: { inspectionId } }),
    prisma.inspection.delete({ where: { id: inspectionId } }),
  ]);

  revalidatePath("/dashboard/inspections");
  redirect(`/dashboard/properties/${inspection.propertyId}`);
}

// Links this inspection to an earlier one (same property, same template only) for
// side-by-side comparison — plain-argument, auto-save style like elsewhere in the app.
export async function setComparisonInspection(inspectionId: string, comparedToInspectionId: string | null) {
  const user = await requireUser();

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: user.companyId || undefined } },
  });
  if (!inspection) throw new Error("Inspection not found");

  if (comparedToInspectionId) {
    const target = await prisma.inspection.findFirst({
      where: { id: comparedToInspectionId, propertyId: inspection.propertyId },
    });
    if (!target) throw new Error("That inspection isn't for the same property");
  }

  await prisma.inspection.update({ where: { id: inspectionId }, data: { comparedToInspectionId } });
}
