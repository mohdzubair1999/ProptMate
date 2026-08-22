"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auditLog";
import { TYPE_LABELS } from "@/lib/complianceDocumentTypes";

async function requireStaff() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) throw new Error("No company associated with this account");
  return { companyId, userId: session.user.id as string, userEmail: session.user.email as string };
}

export async function addComplianceDocument(formData: FormData) {
  const { companyId, userId, userEmail } = await requireStaff();

  const propertyId = String(formData.get("propertyId") || "");
  const type = String(formData.get("type") || "");
  const otherTypeLabel = String(formData.get("otherTypeLabel") || "").trim() || null;
  const certificateNumber = String(formData.get("certificateNumber") || "").trim() || null;
  const issuingBody = String(formData.get("issuingBody") || "").trim() || null;
  const issueDateRaw = String(formData.get("issueDate") || "");
  const expiryDateRaw = String(formData.get("expiryDate") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  const file = formData.get("file") as File | null;

  if (!propertyId || !type) throw new Error("Missing required fields");

  const issueDate = issueDateRaw ? new Date(issueDateRaw) : null;
  const expiryDate = expiryDateRaw ? new Date(expiryDateRaw) : null;
  if (issueDate && expiryDate && expiryDate < issueDate) {
    throw new Error("Expiry date can't be before the issue date");
  }

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
  if (!property) throw new Error("Property not found");

  let documentUrl: string | null = null;
  if (file && file.size > 0) {
    const blob = await put(`compliance-documents/${propertyId}-${Date.now()}-${file.name}`, file, { access: "public" });
    documentUrl = blob.url;
  }

  await prisma.complianceDocument.create({
    data: {
      propertyId,
      type: type as any,
      otherTypeLabel,
      certificateNumber,
      issuingBody,
      issueDate,
      expiryDate,
      documentUrl,
      notes,
      uploadedById: userId,
    },
  });

  await logAuditEvent({
    companyId,
    userId,
    userEmail,
    action: "compliance.created",
    entityType: "ComplianceDocument",
    entityId: propertyId,
    description: `Added ${TYPE_LABELS[type] || type} for ${property.address}`,
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function updateComplianceDocument(formData: FormData) {
  const { companyId, userId, userEmail } = await requireStaff();

  const documentId = String(formData.get("documentId") || "");
  const propertyId = String(formData.get("propertyId") || "");
  const certificateNumber = String(formData.get("certificateNumber") || "").trim() || null;
  const issuingBody = String(formData.get("issuingBody") || "").trim() || null;
  const issueDateRaw = String(formData.get("issueDate") || "");
  const expiryDateRaw = String(formData.get("expiryDate") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  const file = formData.get("file") as File | null;

  const existing = await prisma.complianceDocument.findFirst({
    where: { id: documentId, property: { companyId } },
    include: { property: { select: { address: true } } },
  });
  if (!existing) throw new Error("Document not found");

  const issueDate = issueDateRaw ? new Date(issueDateRaw) : null;
  const expiryDate = expiryDateRaw ? new Date(expiryDateRaw) : null;
  if (issueDate && expiryDate && expiryDate < issueDate) {
    throw new Error("Expiry date can't be before the issue date");
  }

  let documentUrl = existing.documentUrl;
  if (file && file.size > 0) {
    const blob = await put(`compliance-documents/${propertyId}-${Date.now()}-${file.name}`, file, { access: "public" });
    documentUrl = blob.url;
  }

  await prisma.complianceDocument.update({
    where: { id: documentId },
    data: {
      certificateNumber,
      issuingBody,
      issueDate,
      expiryDate,
      documentUrl,
      notes,
    },
  });

  await logAuditEvent({
    companyId,
    userId,
    userEmail,
    action: "compliance.updated",
    entityType: "ComplianceDocument",
    entityId: documentId,
    description: `Updated ${TYPE_LABELS[existing.type] || existing.type} for ${existing.property.address}`,
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function deleteComplianceDocument(formData: FormData) {
  const { companyId, userId, userEmail } = await requireStaff();

  const documentId = String(formData.get("documentId") || "");
  const propertyId = String(formData.get("propertyId") || "");

  const existing = await prisma.complianceDocument.findFirst({
    where: { id: documentId, property: { companyId } },
    include: { property: { select: { address: true } } },
  });
  if (!existing) throw new Error("Document not found");

  await prisma.complianceDocument.delete({ where: { id: documentId } });

  await logAuditEvent({
    companyId,
    userId,
    userEmail,
    action: "compliance.deleted",
    entityType: "ComplianceDocument",
    entityId: documentId,
    description: `Deleted ${TYPE_LABELS[existing.type] || existing.type} for ${existing.property.address}`,
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}
