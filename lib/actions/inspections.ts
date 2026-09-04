"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auditLog";
import { del } from "@vercel/blob";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return {
    id: (session.user as any).id as string,
    email: (session.user as any).email as string,
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
      "client name": property.landlordName,
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
  const cleanlinessRaw = String(formData.get("cleanliness") || "").trim();
  const cleanlinessCustom = String(formData.get("cleanlinessCustom") || "").trim();
  const cleanliness = (cleanlinessRaw === "custom" ? cleanlinessCustom : cleanlinessRaw) || null;

  if (!inspectionId || !room || !itemName) throw new Error("Room and item name are required");

  await prisma.inspectionItem.create({ data: { inspectionId, room, itemName, condition, make, notes, cleanliness, templateFieldId } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Plain-argument version for the standard-items checklist — called directly from the client
// component when an item is selected and a condition chosen, same pattern as other
// auto-save-style interactions elsewhere in the app.
export async function addInspectionItemDirect(
  inspectionId: string,
  room: string,
  itemName: string,
  condition: string,
  templateFieldId: string | null,
  make?: string,
  quantity?: number,
  notes?: string,
  cleanliness?: string
) {
  await requireUser();

  if (!inspectionId || !room || !itemName) throw new Error("Room and item name are required");

  await prisma.inspectionItem.create({
    data: {
      inspectionId,
      room,
      itemName,
      condition,
      make: make?.trim() || null,
      quantity: quantity && quantity > 0 ? quantity : null,
      templateFieldId,
      notes: notes?.trim() || null,
      cleanliness: cleanliness?.trim() || null,
    },
  });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

export async function completeInspection(formData: FormData) {
  const user = await requireUser();
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "completed", completedDate: new Date() },
    include: { property: { select: { address: true, companyId: true } } },
  });

  await logAuditEvent({
    companyId: inspection.property.companyId,
    userId: user.id,
    userEmail: user.email,
    action: "inspection.completed",
    entityType: "Inspection",
    entityId: inspectionId,
    description: `Completed ${inspection.type} inspection for ${inspection.property.address}`,
  });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
  revalidatePath("/dashboard/inspections");
  // Redirects with a one-time flag so the completion page can show a genuine "just finished"
  // moment right now, without it reappearing every time someone revisits this inspection
  // days or weeks later — a stale "nice work!" on an old report would feel wrong, not warm.
  redirect(`/dashboard/inspections/${inspectionId}?justCompleted=1`);
}

export async function appendItemNotes(itemId: string, text: string, inspectionId: string, replace = false) {
  await requireUser();
  if (!itemId || !text) return;

  const item = await prisma.inspectionItem.findFirst({ where: { id: itemId, inspection: { deletedAt: null } } });
  if (!item) return;

  const updated = replace ? text : item.notes ? `${item.notes}\n\n${text}` : text;
  await prisma.inspectionItem.update({ where: { id: itemId }, data: { notes: updated } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Applies inventory changes the person has already reviewed and confirmed — the AI command
// route only ever proposes changes, it never touches the database directly, so this is the
// one place those changes actually take effect. Re-validates every item against the real
// database rather than trusting the client-submitted list, since a change already reviewed
// once client-side is still untrusted input the moment it's submitted back to the server.
export async function reopenInspection(formData: FormData) {
  const user = await requireUser();
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.update({
    where: { id: inspectionId },
    data: { status: "draft", completedDate: null },
    include: { property: { select: { address: true, companyId: true } } },
  });

  // Genuinely worth tracking distinctly from a normal edit — someone reopening and changing
  // an already-completed inspection is exactly the kind of thing an audit trail exists for,
  // especially given these records can end up relevant to a deposit dispute.
  await logAuditEvent({
    companyId: inspection.property.companyId,
    userId: user.id,
    userEmail: user.email,
    action: "inspection.reopened",
    entityType: "Inspection",
    entityId: inspectionId,
    description: `Reopened ${inspection.type} inspection for ${inspection.property.address}`,
  });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
  revalidatePath("/dashboard/inspections");
}

export async function deleteInspection(formData: FormData) {
  const user = await requireUser();
  assertManagerOrAdmin(user.role);
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: user.companyId || undefined }, deletedAt: null },
    include: { property: { select: { address: true } } },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { deletedAt: new Date() },
  });

  if (user.companyId) {
    await logAuditEvent({
      companyId: user.companyId,
      userId: user.id,
      userEmail: user.email,
      action: "inspection.deleted",
      entityType: "Inspection",
      entityId: inspectionId,
      description: `Deleted ${inspection.type} inspection for ${inspection.property.address}`,
    });
  }

  revalidatePath("/dashboard/inspections");
  revalidatePath("/dashboard/settings/recently-deleted");
  redirect(`/dashboard/properties/${inspection.propertyId}`);
}

// Lists soft-deleted inspections for this company, most recently deleted first — backs the
// "Recently deleted" recovery screen.
export async function getDeletedInspections() {
  const user = await requireUser();
  assertManagerOrAdmin(user.role);
  if (!user.companyId) return [];

  return prisma.inspection.findMany({
    where: { property: { companyId: user.companyId }, deletedAt: { not: null } },
    include: { property: { select: { address: true } } },
    orderBy: { deletedAt: "desc" },
  });
}

// Clears deletedAt, making a soft-deleted inspection fully active again — everything linked
// to it (items, answers, photos, report) was never touched by the soft delete, so this is a
// complete, immediate restore with nothing to reconstruct.
export async function restoreInspection(formData: FormData) {
  const user = await requireUser();
  assertManagerOrAdmin(user.role);
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: user.companyId || undefined }, deletedAt: { not: null } },
    include: { property: { select: { address: true } } },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { deletedAt: null },
  });

  if (user.companyId) {
    await logAuditEvent({
      companyId: user.companyId,
      userId: user.id,
      userEmail: user.email,
      action: "inspection.restored",
      entityType: "Inspection",
      entityId: inspectionId,
      description: `Restored ${inspection.type} inspection for ${inspection.property.address}`,
    });
  }

  revalidatePath("/dashboard/settings/recently-deleted");
  revalidatePath("/dashboard/inspections");
}

// The real, irreversible cleanup the original hard-delete used to do — only ever reachable
// from an already soft-deleted inspection, so nothing can be permanently destroyed without
// first passing through the recoverable state. Removes the actual blob-stored photo files
// too, not just the database records, since those are what was actually consuming storage.
export async function permanentlyDeleteInspection(formData: FormData) {
  const user = await requireUser();
  assertManagerOrAdmin(user.role);
  const inspectionId = String(formData.get("inspectionId") || "");
  if (!inspectionId) return;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: user.companyId || undefined }, deletedAt: { not: null } },
    include: {
      property: { select: { address: true } },
      items: { include: { photos: true } },
      answers: { include: { photos: true } },
    },
  });
  if (!inspection) throw new Error("Inspection not found");

  const photoUrls = [...inspection.items.flatMap((i) => i.photos.map((p) => p.url)), ...inspection.answers.flatMap((a) => a.photos.map((p) => p.url))];

  await prisma.$transaction([
    prisma.photo.deleteMany({ where: { OR: [{ inspectionItem: { inspectionId } }, { fieldAnswer: { inspectionId } }] } }),
    prisma.fieldAnswer.deleteMany({ where: { inspectionId } }),
    prisma.inspectionItem.deleteMany({ where: { inspectionId } }),
    prisma.report.deleteMany({ where: { inspectionId } }),
    prisma.inspection.delete({ where: { id: inspectionId } }),
  ]);

  for (const url of photoUrls) {
    try {
      await del(url);
    } catch (err) {
      console.error("Failed to delete blob for photo", url, err);
    }
  }

  if (user.companyId) {
    await logAuditEvent({
      companyId: user.companyId,
      userId: user.id,
      userEmail: user.email,
      action: "inspection.permanently_deleted",
      entityType: "Inspection",
      entityId: inspectionId,
      description: `Permanently deleted ${inspection.type} inspection for ${inspection.property.address}`,
    });
  }

  revalidatePath("/dashboard/settings/recently-deleted");
}

// Links this inspection to an earlier one (same property, same template only) for
// side-by-side comparison — plain-argument, auto-save style like elsewhere in the app.
export async function setComparisonInspection(inspectionId: string, comparedToInspectionId: string | null) {
  const user = await requireUser();

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: user.companyId || undefined }, deletedAt: null },
  });
  if (!inspection) throw new Error("Inspection not found");

  if (comparedToInspectionId) {
    const target = await prisma.inspection.findFirst({
      where: { id: comparedToInspectionId, propertyId: inspection.propertyId, deletedAt: null },
    });
    if (!target) throw new Error("That inspection isn't for the same property");
  }

  await prisma.inspection.update({ where: { id: inspectionId }, data: { comparedToInspectionId } });
}

// Saves one field of the Summary Reference section at a time — same auto-save-on-blur
// pattern as the rest of the inspection form, not a single big submit button.
// Confirms a date string is both correctly formatted AND a real calendar date — catches
// things like "2026-02-30" that a plain regex would let through, since Date silently rolls
// invalid dates like that over to the next valid one rather than rejecting them.
function isValidDateString(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00Z");
  if (isNaN(d.getTime())) return false;
  const [y, m, day] = value.split("-").map(Number);
  return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m && d.getUTCDate() === day;
}

// Imports an externally-sourced check-in report (from a different agency, not created in
// ProptMate) as a real inspection record — uploads the original document for later
// reference, validates every AI-suggested field value server-side against that field's
// exact required format before saving anything, and links the result as the comparison for
// the checkout currently in progress.
export async function importCheckInReport(
  checkoutInspectionId: string,
  sourceDocumentUrl: string,
  roomSummaries: { room: string; summary: string }[],
  mappings: { fieldId: string; value: string; confidence: string }[]
) {
  const user = await requireUser();

  if (!sourceDocumentUrl) throw new Error("No document was uploaded");

  const checkout = await prisma.inspection.findFirst({
    where: { id: checkoutInspectionId, property: { companyId: user.companyId || undefined }, deletedAt: null },
    include: { property: true, comparedToInspection: true },
  });
  if (!checkout) throw new Error("Inspection not found");
  if (!checkout.templateId) throw new Error("This inspection has no template to map fields onto");

  const template = await prisma.template.findUnique({
    where: { id: checkout.templateId },
    include: { sections: { include: { fields: true } } },
  });
  if (!template) throw new Error("Template not found");

  // Every field belonging to this exact template, with its own valid-value rule — mappings
  // are checked against this, not just trusted from the AI response, since a wrong value
  // silently saved would look authoritative while actually being incorrect.
  const validFieldIds = new Map(template.sections.flatMap((s) => s.fields.map((f) => [f.id, f] as const)));

  const validatedAnswers: { fieldId: string; value: string }[] = [];
  for (const m of mappings) {
    const field = validFieldIds.get(m?.fieldId);
    if (!field || typeof m.value !== "string" || !m.value.trim()) continue;

    if (field.type === "YES_NO") {
      if (!["Yes", "No", "N/A"].includes(m.value)) continue;
    } else if (field.type === "SCORE") {
      if (!["1", "2", "3", "4", "5"].includes(m.value)) continue;
    } else if (field.type === "DATE") {
      if (!isValidDateString(m.value)) continue;
    } else if (field.type === "NUMBER") {
      if (!Number.isFinite(Number(m.value))) continue;
    } else if (field.type === "DROPDOWN" || field.type === "MULTIPLE_CHOICE") {
      let options: string[] = [];
      try {
        const parsed = JSON.parse(field.options || "[]");
        if (Array.isArray(parsed)) options = parsed;
      } catch {}
      if (!options.includes(m.value)) continue;
    } else if (field.type !== "TEXT" && field.type !== "SHORT_TEXT") {
      // Any other field type (PHOTO, SIGNATURE, INFO_TEXT, etc.) isn't a genuine data
      // value the AI should be filling in at all.
      continue;
    }

    validatedAnswers.push({ fieldId: field.id, value: m.value.slice(0, 5000) });
  }

  const validRoomSummaries = Array.isArray(roomSummaries)
    ? roomSummaries.filter((r) => r?.room && r?.summary).map((r) => ({ room: String(r.room).slice(0, 200), summary: String(r.summary).slice(0, 3000) }))
    : [];

  // A previous import gets fully replaced, not left behind — otherwise every re-upload
  // (fixing a mistake, trying a different document) would silently accumulate an orphaned
  // Inspection record with nothing ever pointing back to it. Only ever removes a comparison
  // this feature itself created (has a sourceDocumentUrl); a genuine sibling ProptMate
  // check-in the person is comparing against is never touched here.
  if (checkout.comparedToInspection?.sourceDocumentUrl) {
    await deleteInspectionAndDependents(checkout.comparedToInspection.id);
  }

  const imported = await prisma.inspection.create({
    data: {
      propertyId: checkout.propertyId,
      inspectorId: user.id,
      type: "check-in",
      status: "completed",
      completedDate: new Date(),
      templateId: checkout.templateId,
      sourceDocumentUrl,
      importedRoomSummaries: validRoomSummaries.length > 0 ? JSON.stringify(validRoomSummaries) : null,
    },
  });

  if (validatedAnswers.length > 0) {
    await prisma.fieldAnswer.createMany({
      data: validatedAnswers.map((a) => ({ inspectionId: imported.id, fieldId: a.fieldId, value: a.value })),
    });
  }

  await prisma.inspection.update({ where: { id: checkoutInspectionId }, data: { comparedToInspectionId: imported.id } });

  revalidatePath(`/dashboard/inspections/${checkoutInspectionId}`);
  return { importedInspectionId: imported.id, mappedCount: validatedAnswers.length, roomSummaryCount: validRoomSummaries.length };
}

export async function saveSummaryReferenceField(inspectionId: string, field: string, value: string) {
  const user = await requireUser();

  const allowedFields = [
    "propertyDescription",
    "clientName",
    "clientAddress",
    "otherAlarmLocation",
    "otherAlarmTested",
    "boilerLocation",
    "stopcockLocation",
    "fuseBoxLocation",
  ];
  // Guards against saving to an arbitrary column name — field comes from client-side code we
  // wrote ourselves, but this is cheap insurance against a typo or future refactor accidentally
  // opening this up to write any column.
  if (!allowedFields.includes(field)) throw new Error("Unknown field");

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: user.companyId || undefined }, deletedAt: null },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.inspection.update({ where: { id: inspectionId }, data: { [field]: value || null } as any });
}

// Deletes a photo from a room item or a template field answer — checks company ownership
// through whichever parent it's actually attached to, then removes both the database record
// and the real file in Blob storage, so a deleted photo doesn't keep quietly taking up space.
export async function deletePhoto(photoId: string) {
  const user = await requireUser();

  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: {
      inspectionItem: { include: { inspection: { include: { property: true } } } },
      fieldAnswer: { include: { inspection: { include: { property: true } } } },
    },
  });
  if (!photo) throw new Error("Photo not found");

  const inspection = photo.inspectionItem?.inspection || photo.fieldAnswer?.inspection;
  if (!inspection || inspection.property.companyId !== user.companyId) {
    throw new Error("Photo not found");
  }

  await prisma.photo.delete({ where: { id: photoId } });

  try {
    await del(photo.url);
  } catch (err) {
    // The database record is already gone at this point — worth logging, but not worth
    // failing the whole action over, since the person's actual goal (removing the photo
    // from their inspection) has already succeeded either way.
    console.error("Failed to delete blob for photo", photoId, err);
  }

  revalidatePath(`/dashboard/inspections/${inspection.id}`);
}

// Deletes several photos in one action — either specific ones someone picked, or every photo
// on an item/field at once — rather than requiring the "×" on each thumbnail to be clicked
// one at a time. Re-verifies ownership per photo individually (same check as the single-photo
// version above), never trusting that a submitted ID genuinely belongs to this company just
// because it showed up in a bulk request. Continues through any photo that fails rather than
// stopping at the first problem, so one bad ID can't block deleting the rest.
export async function deletePhotos(photoIds: string[]) {
  const user = await requireUser();
  if (photoIds.length === 0) return;

  let inspectionId: string | null = null;

  for (const photoId of photoIds) {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        inspectionItem: { include: { inspection: { include: { property: true } } } },
        fieldAnswer: { include: { inspection: { include: { property: true } } } },
      },
    });
    if (!photo) continue;

    const inspection = photo.inspectionItem?.inspection || photo.fieldAnswer?.inspection;
    if (!inspection || inspection.property.companyId !== user.companyId) continue;

    inspectionId = inspection.id;

    await prisma.photo.delete({ where: { id: photoId } });

    try {
      await del(photo.url);
    } catch (err) {
      console.error("Failed to delete blob for photo", photoId, err);
    }
  }

  if (inspectionId) revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Edits an already-added inventory item's condition, make, quantity, or notes — until now
// items could only be added, never corrected after the fact (e.g. picking the wrong
// condition by mistake, or wanting to add a note later).
export async function updateInventoryItem(
  itemId: string,
  condition: string,
  make: string | undefined,
  quantity: number | undefined,
  notes: string | undefined,
  cleanliness: string | undefined
) {
  const user = await requireUser();

  const item = await prisma.inspectionItem.findFirst({
    where: { id: itemId, inspection: { property: { companyId: user.companyId || undefined }, deletedAt: null } },
  });
  if (!item) throw new Error("Item not found");

  await prisma.inspectionItem.update({
    where: { id: itemId },
    data: {
      condition,
      make: make?.trim() || null,
      quantity: quantity && quantity > 0 ? quantity : null,
      notes: notes?.trim() || null,
      cleanliness: cleanliness?.trim() || null,
    },
  });

  revalidatePath(`/dashboard/inspections/${item.inspectionId}`);
}

// Removes an already-added inventory item entirely, including its photos — both the
// database records and the actual files in Blob storage, matching deletePhoto's cleanup.
export async function deleteInventoryItem(itemId: string) {
  const user = await requireUser();

  const item = await prisma.inspectionItem.findFirst({
    where: { id: itemId, inspection: { property: { companyId: user.companyId || undefined }, deletedAt: null } },
    include: { photos: true },
  });
  if (!item) throw new Error("Item not found");

  await prisma.inspectionItem.delete({ where: { id: itemId } });

  for (const photo of item.photos) {
    try {
      await del(photo.url);
    } catch (err) {
      console.error("Failed to delete blob for photo", photo.id, err);
    }
  }

  revalidatePath(`/dashboard/inspections/${item.inspectionId}`);
}

// Soft-deletes an Inspection — sets deletedAt so it's hidden from every normal view but
// remains fully recoverable, rather than actually destroying the record and everything it
// owns. Used both when the person explicitly wants to remove an imported check-in comparison,
// and automatically before a fresh re-upload replaces one.
async function deleteInspectionAndDependents(inspectionId: string) {
  await prisma.inspection.update({
    where: { id: inspectionId },
    data: { deletedAt: new Date() },
  });
}

// Removes a previously-imported check-in comparison entirely — the imported Inspection
// record, everything it owns, and unlinks it from the checkout. Used both when the person
// explicitly wants to remove an import, and automatically before a fresh re-upload replaces
// one, so re-uploading doesn't silently leave the old import orphaned in the database and
// its source document sitting unused in storage forever.
export async function deleteImportedCheckIn(checkoutInspectionId: string) {
  const user = await requireUser();

  const checkout = await prisma.inspection.findFirst({
    where: { id: checkoutInspectionId, property: { companyId: user.companyId || undefined }, deletedAt: null },
    include: { comparedToInspection: true },
  });
  if (!checkout) throw new Error("Inspection not found");

  const imported = checkout.comparedToInspection;
  // Only ever removes an inspection this feature itself created — never a genuine sibling
  // ProptMate check-in the person is comparing against, which must never be touched here.
  if (!imported || !imported.sourceDocumentUrl) throw new Error("No imported comparison to remove");

  await prisma.inspection.update({ where: { id: checkoutInspectionId }, data: { comparedToInspectionId: null } });
  await deleteInspectionAndDependents(imported.id);

  revalidatePath(`/dashboard/inspections/${checkoutInspectionId}`);
  revalidatePath("/dashboard/settings/recently-deleted");
}
