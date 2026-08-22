"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

async function requireStaff() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const companyId = (session.user as any).companyId as string | null;
  if (role !== "ADMIN" && role !== "MANAGER") throw new Error("Only an Admin or Manager can invite tenants or landlords");
  if (!companyId) throw new Error("No company associated with this account");
  return companyId;
}

// Invites a tenant or landlord to the self-service portal for a specific property — creates
// their account (same pattern as inviting a staff team member) and links them to the property.
// If the email already has a CLIENT account, it just adds the new property link rather than
// erroring, so one person can be linked to multiple properties over time.
export async function inviteClient(formData: FormData) {
  const companyId = await requireStaff();

  const propertyId = String(formData.get("propertyId") || "");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const relation = String(formData.get("relation") || "TENANT") as "TENANT" | "LANDLORD";

  if (!propertyId || !name || !email) throw new Error("Name and email are required");

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
  if (!property) throw new Error("Property not found");

  let user = await prisma.user.findUnique({ where: { email } });

  if (user) {
    if (user.role !== "CLIENT") throw new Error("This email already belongs to a staff account");
  } else {
    if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");
    const hashed = await bcrypt.hash(password, 10);
    user = await prisma.user.create({ data: { name, email, role: "CLIENT", emailVerified: true } });
    await prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password: hashed },
    });
  }

  const existingAccess = await prisma.propertyAccess.findUnique({
    where: { userId_propertyId: { userId: user.id, propertyId } },
  });
  if (existingAccess) throw new Error("This person already has access to this property");

  await prisma.propertyAccess.create({ data: { userId: user.id, propertyId, relation } });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function removeClientAccess(formData: FormData) {
  const companyId = await requireStaff();
  const accessId = String(formData.get("accessId") || "");
  if (!accessId) return;

  const access = await prisma.propertyAccess.findFirst({
    where: { id: accessId, property: { companyId } },
  });
  if (!access) throw new Error("Access record not found");

  await prisma.propertyAccess.delete({ where: { id: accessId } });

  revalidatePath(`/dashboard/properties/${access.propertyId}`);
}

// Changes an existing person's relationship (Tenant/Landlord) without needing to remove and
// re-invite them — plain-argument, called directly from a client component for auto-save.
export async function updateClientRelation(accessId: string, relation: "TENANT" | "LANDLORD") {
  const companyId = await requireStaff();

  const access = await prisma.propertyAccess.findFirst({
    where: { id: accessId, property: { companyId } },
  });
  if (!access) throw new Error("Access record not found");

  await prisma.propertyAccess.update({ where: { id: accessId }, data: { relation } });
  revalidatePath(`/dashboard/properties/${access.propertyId}`);
}

// Edits a client's name/email. Deliberately a real form submit, not auto-save — since email
// is their actual login, we don't want a half-typed value saving mid-keystroke.
export async function updateClientProfile(formData: FormData) {
  const companyId = await requireStaff();

  const userId = String(formData.get("userId") || "");
  const propertyId = String(formData.get("propertyId") || "");
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();

  if (!name || !email) throw new Error("Name and email are required");

  // Confirm this user is actually linked to a property this company owns, before letting
  // staff edit them at all.
  const access = await prisma.propertyAccess.findFirst({ where: { userId, property: { companyId } } });
  if (!access) throw new Error("This person isn't linked to any of your properties");

  const emailTaken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
  if (emailTaken) throw new Error("That email is already in use by another account");

  await prisma.user.update({ where: { id: userId }, data: { name, email } });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

// Fixes a typo'd name or changes someone's Tenant/Landlord designation without having to
// remove and re-invite them (which would also mean generating a whole new password).
export async function updateClientAccess(formData: FormData) {
  const companyId = await requireStaff();
  const accessId = String(formData.get("accessId") || "");
  const name = String(formData.get("name") || "").trim();
  const relation = String(formData.get("relation") || "") as "TENANT" | "LANDLORD";

  if (!accessId || !name) throw new Error("Name is required");

  const access = await prisma.propertyAccess.findFirst({
    where: { id: accessId, property: { companyId } },
  });
  if (!access) throw new Error("Access record not found");

  await prisma.$transaction([
    prisma.user.update({ where: { id: access.userId }, data: { name } }),
    prisma.propertyAccess.update({ where: { id: accessId }, data: { relation } }),
  ]);

  revalidatePath(`/dashboard/properties/${access.propertyId}`);
}

// Assigns a self-service inspection to a specific tenant/landlord so it shows up in their
// portal for them to fill out themselves.
export async function assignInspectionToClient(formData: FormData) {
  const companyId = await requireStaff();
  const inspectionId = String(formData.get("inspectionId") || "");
  const clientUserId = String(formData.get("clientUserId") || "") || null;

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId } },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.inspection.update({ where: { id: inspectionId }, data: { assignedClientId: clientUserId } });

  revalidatePath(`/dashboard/inspections/${inspectionId}`);
}

// Plain-argument version for auto-save — called directly from a client component when the
// dropdown selection changes, same pattern as the other auto-save fields in the app.
export async function assignInspectionToClientDirect(inspectionId: string, clientUserId: string | null) {
  const companyId = await requireStaff();

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId } },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.inspection.update({ where: { id: inspectionId }, data: { assignedClientId: clientUserId } });
}
