"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auditLog";

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
    const landlordName = String(formData.get("landlordName") || "").trim() || null;
    const landlordAddress = String(formData.get("landlordAddress") || "").trim() || null;
    const notes = String(formData.get("notes") || "").trim() || null;

    if (!address) return { error: "Address is required" };

    const property = await prisma.property.create({
      data: { companyId: user.companyId, address, city, postcode, bedrooms, type, landlordName, landlordAddress, notes },
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

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId || undefined } });
  if (!property) throw new Error("Property not found");

  const inspections = await prisma.inspection.findMany({ where: { propertyId }, select: { id: true } });
  const inspectionIds = inspections.map((i) => i.id);

  await prisma.$transaction([
    prisma.photo.deleteMany({ where: { OR: [{ inspectionItem: { inspectionId: { in: inspectionIds } } }, { fieldAnswer: { inspectionId: { in: inspectionIds } } }] } }),
    prisma.fieldAnswer.deleteMany({ where: { inspectionId: { in: inspectionIds } } }),
    prisma.inspectionItem.deleteMany({ where: { inspectionId: { in: inspectionIds } } }),
    prisma.report.deleteMany({ where: { inspectionId: { in: inspectionIds } } }),
    prisma.inspection.deleteMany({ where: { propertyId } }),
    prisma.property.delete({ where: { id: propertyId } }),
  ]);

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

export async function updateProperty(formData: FormData) {
  const user = await requireUser();

  const propertyId = String(formData.get("propertyId") || "");
  const address = String(formData.get("address") || "").trim();
  const city = String(formData.get("city") || "").trim() || null;
  const postcode = String(formData.get("postcode") || "").trim() || null;
  const bedroomsRaw = String(formData.get("bedrooms") || "").trim();
  const bedrooms = bedroomsRaw ? parseInt(bedroomsRaw, 10) : null;
  const type = String(formData.get("type") || "flat");
  const landlordName = String(formData.get("landlordName") || "").trim() || null;
  const landlordAddress = String(formData.get("landlordAddress") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const frequencyRaw = String(formData.get("inspectionFrequencyMonths") || "").trim();
  const frequencyParsed = frequencyRaw ? parseInt(frequencyRaw, 10) : null;
  const inspectionFrequencyMonths = frequencyParsed && frequencyParsed > 0 ? frequencyParsed : null;

  if (!propertyId || !address) throw new Error("Address is required");

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId || undefined } });
  if (!property) throw new Error("Property not found");

  await prisma.property.update({
    where: { id: propertyId },
    data: { address, city, postcode, bedrooms, type, landlordName, landlordAddress, notes, inspectionFrequencyMonths },
  });

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
