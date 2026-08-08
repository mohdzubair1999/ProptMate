"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return {
    companyId: (session.user as any).companyId as string | null,
    role: (session.user as any).role as string,
  };
}

export async function createProperty(formData: FormData) {
  const user = await requireUser();
  if (!user.companyId) throw new Error("No company associated with this account");

  const address = String(formData.get("address") || "").trim();
  const city = String(formData.get("city") || "").trim() || null;
  const postcode = String(formData.get("postcode") || "").trim() || null;
  const bedroomsRaw = String(formData.get("bedrooms") || "").trim();
  const bedrooms = bedroomsRaw ? parseInt(bedroomsRaw, 10) : null;
  const type = String(formData.get("type") || "flat");
  const landlordName = String(formData.get("landlordName") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!address) throw new Error("Address is required");

  const property = await prisma.property.create({
    data: { companyId: user.companyId, address, city, postcode, bedrooms, type, landlordName, notes },
  });

  revalidatePath("/dashboard/properties");
  redirect(`/dashboard/properties/${property.id}`);
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
  const notes = String(formData.get("notes") || "").trim() || null;
  const frequencyRaw = String(formData.get("inspectionFrequencyMonths") || "").trim();
  const frequencyParsed = frequencyRaw ? parseInt(frequencyRaw, 10) : null;
  const inspectionFrequencyMonths = frequencyParsed && frequencyParsed > 0 ? frequencyParsed : null;

  if (!propertyId || !address) throw new Error("Address is required");

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId || undefined } });
  if (!property) throw new Error("Property not found");

  await prisma.property.update({
    where: { id: propertyId },
    data: { address, city, postcode, bedrooms, type, landlordName, notes, inspectionFrequencyMonths },
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
  revalidatePath("/dashboard/properties");
  redirect(`/dashboard/properties/${propertyId}`);
}
