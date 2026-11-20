"use server";

import { scopeCompanyId } from "@/lib/access";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auditLog";
import type { ClientDb } from "@/lib/clientContacts";
import { fileUrlsForInspections, fileUrlsForCompliance, deleteBlobs } from "@/lib/fileCleanup";
import { assertCanAddProperties, activePropertyCount } from "@/lib/planLimitsDb";
import { checkPropertyLimit } from "@/lib/planLimits";
import { cleanIds } from "@/lib/bulkIds";
import { clientFieldsForCreate, clientFieldsForUpdate } from "@/lib/propertyClientData";

// See lib/actions/team.ts for why this exists: a thrown Error from an action bound to a plain
// <form action> has nowhere to go and crashes the whole page - this lets createProperty and
// createInspection return { error } instead, while still letting redirect()'s own internal
// "throw" through untouched.
function isRedirectThrow(err: unknown): boolean {
  return !!err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
}

async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return {
    id: session.user.id,
    email: session.user.email,
    companyId: (session.user as any).companyId as string | null,
    role: (session.user as any).role as string,
  };
}

export async function createProperty(_prevState: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  try {
    const user = await requireUser();
    // A user created without a company attached (e.g. an account provisioned outside the normal
    // "Add a team member" flow) can sign in and reach this page, but has nowhere to save a
    // property to - this is the single most likely reason a newly-added person's very first
    // "Add property" fails, so the message says so plainly rather than something generic.
    if (!user.companyId) return { error: "Your account isn't linked to a company yet - ask an Admin to check your account on the Team page." };

    const address = String(formData.get("address") || "").trim();
    const city = String(formData.get("city") || "").trim() || null;
    const postcode = String(formData.get("postcode") || "").trim() || null;
    const bedroomsRaw = String(formData.get("bedrooms") || "").trim();
    const bedrooms = bedroomsRaw ? parseInt(bedroomsRaw, 10) : null;
    const type = String(formData.get("type") || "flat");
    const notes = String(formData.get("notes") || "").trim() || null;

    if (!address) return { error: "Address is required" };

    // A saved client (of THIS company) supplies the client name and address, and the property follows it from then on
    const client = await clientFieldsForCreate(formData, prisma as unknown as ClientDb, user.companyId);
    if (!client.ok) return { error: client.error };

    await assertCanAddProperties(user.companyId, 1); // throws a readable message when the plan is full

    const property = await prisma.property.create({
      data: { companyId: user.companyId, address, city, postcode, bedrooms, type, landlordName: client.landlordName, landlordAddress: client.landlordAddress, clientContactId: client.clientContactId, notes },
    });

    await logAuditEvent({
      companyId: user.companyId,
      userId: user.id,
      userEmail: user.email,
      action: "property.created",
      entityType: "Property",
      entityId: property.id,
      description: `Added property ${address}`,
    });

    revalidatePath("/dashboard/properties");
    redirect(`/dashboard/properties/${property.id}`);
  } catch (err) {
    if (isRedirectThrow(err)) throw err;
    return { error: err instanceof Error ? err.message : "Couldn't save this property — please try again." };
  }
}

// Permanently deletes a property and everything under it — every inspection, item, photo,
// answer, and generated report. This is irreversible; the UI requires a confirm step before
// this ever gets called.
export async function deleteProperty(formData: FormData) {
  const user = await requireUser();

  const propertyId = String(formData.get("propertyId") || "");
  if (!propertyId) throw new Error("Missing property id");

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: scopeCompanyId(user.companyId) } });
  if (!property) throw new Error("Property not found");

  const inspections = await prisma.inspection.findMany({ where: { propertyId }, select: { id: true } });
  const inspectionIds = inspections.map((i) => i.id);
  // the stored files (photos, report PDFs, certificates) are listed first and removed only once the records are really gone
  const fileUrls = [...(await fileUrlsForInspections({ propertyId })), ...(await fileUrlsForCompliance({ id: propertyId }))];

  await prisma.$transaction([
    prisma.photo.deleteMany({ where: { OR: [{ inspectionItem: { inspectionId: { in: inspectionIds } } }, { fieldAnswer: { inspectionId: { in: inspectionIds } } }] } }),
    prisma.fieldAnswer.deleteMany({ where: { inspectionId: { in: inspectionIds } } }),
    prisma.inspectionItem.deleteMany({ where: { inspectionId: { in: inspectionIds } } }),
    prisma.report.deleteMany({ where: { inspectionId: { in: inspectionIds } } }),
    prisma.inspection.deleteMany({ where: { propertyId } }),
    prisma.property.delete({ where: { id: propertyId } }),
  ]);

  await deleteBlobs(fileUrls);

  // Logged after the deletion succeeds, not before — if the transaction had failed, there'd
  // be nothing real to log yet, and entityId here intentionally isn't a real foreign key
  // (see the AuditLog model), so this entry stays readable even though the property it
  // describes no longer exists — that's the point of an audit trail.
  if (user.companyId) {
    await logAuditEvent({
      companyId: user.companyId,
      userId: user.id,
      userEmail: user.email,
      action: "property.deleted",
      entityType: "Property",
      entityId: propertyId,
      description: `Deleted property ${property.address}`,
    });
  }

  revalidatePath("/dashboard/properties");
  redirect("/dashboard/properties");
}

// Archiving keeps everything (inspections, reports, photos) but hides the property from the working lists, stops its reminders and frees its place on the plan.
export async function archiveProperty(formData: FormData) {
  const user = await requireUser();
  const propertyId = String(formData.get("propertyId") || "");
  if (!propertyId || !user.companyId) throw new Error("Property not found");
  const res = await prisma.property.updateMany({ where: { id: propertyId, companyId: user.companyId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (res.count === 0) throw new Error("Property not found");
  const p = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId }, select: { address: true } });
  await logAuditEvent({ companyId: user.companyId, userId: user.id, userEmail: user.email, action: "property.archived", entityType: "Property", entityId: propertyId, description: `Archived property ${p?.address ?? ""}`.trim() });
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect("/dashboard/properties");
}

// Restoring takes a place on the plan again, so it is refused when the plan is full.
export async function restoreProperty(formData: FormData) {
  const user = await requireUser();
  const propertyId = String(formData.get("propertyId") || "");
  if (!propertyId || !user.companyId) throw new Error("Property not found");
  const p = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId, archivedAt: { not: null } }, select: { address: true } });
  if (!p) throw new Error("Property not found");
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { planTier: true } });
  const r = checkPropertyLimit(company?.planTier, await activePropertyCount(user.companyId), 1);
  if (!r.ok) throw new Error(r.message);
  await prisma.property.updateMany({ where: { id: propertyId, companyId: user.companyId }, data: { archivedAt: null } });
  await logAuditEvent({ companyId: user.companyId, userId: user.id, userEmail: user.email, action: "property.restored", entityType: "Property", entityId: propertyId, description: `Restored property ${p.address}` });
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}`);
  redirect(`/dashboard/properties/${propertyId}`);
}

// Archive or restore every ticked property in one go (own company only; restoring is refused as a whole if they would not all fit on the plan).
export async function archiveProperties(formData: FormData) {
  const user = await requireUser();
  const ids = cleanIds(formData.getAll("propertyIds"));
  if (!user.companyId || ids.length === 0) redirect("/dashboard/properties");
  const res = await prisma.property.updateMany({ where: { id: { in: ids }, companyId: user.companyId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (res.count > 0) await logAuditEvent({ companyId: user.companyId, userId: user.id, userEmail: user.email, action: "property.archived", entityType: "Property", entityId: ids[0], description: `Archived ${res.count} propert${res.count === 1 ? "y" : "ies"} at once` });
  revalidatePath("/dashboard/properties");
  redirect("/dashboard/properties");
}

export async function restoreProperties(formData: FormData) {
  const user = await requireUser();
  const ids = cleanIds(formData.getAll("propertyIds"));
  if (!user.companyId || ids.length === 0) redirect("/dashboard/properties?archived=1");
  const own = await prisma.property.findMany({ where: { id: { in: ids }, companyId: user.companyId, archivedAt: { not: null } }, select: { id: true } });
  if (own.length === 0) redirect("/dashboard/properties?archived=1");
  const company = await prisma.company.findUnique({ where: { id: user.companyId }, select: { planTier: true } });
  const r = checkPropertyLimit(company?.planTier, await activePropertyCount(user.companyId), own.length);
  if (!r.ok) throw new Error(r.message);
  await prisma.property.updateMany({ where: { id: { in: own.map((o) => o.id) }, companyId: user.companyId }, data: { archivedAt: null } });
  await logAuditEvent({ companyId: user.companyId, userId: user.id, userEmail: user.email, action: "property.restored", entityType: "Property", entityId: own[0].id, description: `Restored ${own.length} propert${own.length === 1 ? "y" : "ies"} at once` });
  revalidatePath("/dashboard/properties");
  redirect("/dashboard/properties");
}

export async function updateProperty(formData: FormData) {
  const user = await requireUser();

  const propertyId = String(formData.get("propertyId") || "");
  const address = String(formData.get("address") || "").trim();
  const city = String(formData.get("city") || "").trim() || null;
  const postcode = String(formData.get("postcode") || "").trim() || null;
  const bedroomsRaw = String(formData.get("bedrooms") || "").trim();
  const bedrooms = bedroomsRaw ? parseInt(bedroomsRaw, 10) : null;
  const type = String(formData.get("type") || "flat");
  const notes = String(formData.get("notes") || "").trim() || null;
  const frequencyRaw = String(formData.get("inspectionFrequencyMonths") || "").trim();
  const frequencyParsed = frequencyRaw ? parseInt(frequencyRaw, 10) : null;
  const inspectionFrequencyMonths = frequencyParsed && frequencyParsed > 0 ? frequencyParsed : null;

  if (!propertyId || !address) throw new Error("Address is required");

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: scopeCompanyId(user.companyId) } });
  if (!property) throw new Error("Property not found");

  // The client name and address are only changed when the form actually sent them. (The edit form used to send neither, so saving ANY edit blanked them.)
  const clientData = await clientFieldsForUpdate(formData, prisma as unknown as ClientDb, scopeCompanyId(user.companyId));
  if (!clientData.ok) throw new Error(clientData.error);
  await prisma.property.update({ where: { id: propertyId }, data: { address, city, postcode, bedrooms, type, notes, inspectionFrequencyMonths, ...clientData.data } });

  if (user.companyId) {
    await logAuditEvent({
      companyId: user.companyId,
      userId: user.id,
      userEmail: user.email,
      action: "property.updated",
      entityType: "Property",
      entityId: propertyId,
      description: `Updated property ${address}`,
    });
  }

  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath("/dashboard/properties");
  redirect(`/dashboard/properties/${propertyId}`);
}
