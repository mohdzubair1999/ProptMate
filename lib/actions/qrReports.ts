"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/rateLimit";
import { isIpBlocked, logSecurityEvent } from "@/lib/security";

export async function submitQrIssueReport(
  propertyId: string,
  description: string,
  photoUrl: string | undefined,
  reporterName: string | undefined,
  reporterContact: string | undefined
) {
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";

  if (await isIpBlocked(clientIp)) {
    throw new Error("Unable to submit this report");
  }

  const rateLimit = await checkRateLimit(`qr-report:${clientIp}`, 5, 15);
  if (!rateLimit.allowed) {
    await logSecurityEvent("rate_limit_exceeded", "low", clientIp, "submitQrIssueReport", `Exceeded 5 report submissions in 15 minutes for property ${propertyId}`);
    throw new Error(`Too many reports submitted recently - please try again in a few minutes.`);
  }

  const trimmedDescription = description.trim();
  if (!trimmedDescription) throw new Error("Please describe the issue");
  if (trimmedDescription.length > 2000) throw new Error("That description is too long - please keep it under 2000 characters");

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) throw new Error("This property could not be found");

  // photoUrl, when provided, must genuinely be one of our own Vercel Blob URLs from the
  // dedicated upload route - not trusted as an arbitrary client-supplied URL, since this is
  // later rendered as an <img src> to staff, and accepting any URL here would let someone
  // use a report as a way to get an arbitrary external link opened by whoever reviews it.
  if (photoUrl && !(photoUrl.startsWith("https://") && photoUrl.includes(".public.blob.vercel-storage.com"))) {
    await logSecurityEvent("invalid_photo_url", "low", clientIp, "submitQrIssueReport", `Rejected non-Blob photoUrl: ${photoUrl.slice(0, 200)}`);
    throw new Error("Invalid photo reference");
  }

  await prisma.qrIssueReport.create({
    data: {
      propertyId,
      description: trimmedDescription,
      photoUrl,
      reporterName: reporterName?.trim() || undefined,
      reporterContact: reporterContact?.trim() || undefined,
    },
  });

  revalidatePath(`/dashboard/properties/${propertyId}`);
}

export async function updateQrIssueReportStatus(reportId: string, status: "new" | "reviewed" | "resolved") {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) throw new Error("No company associated with this account");

  const report = await prisma.qrIssueReport.findUnique({ where: { id: reportId }, select: { propertyId: true, property: { select: { companyId: true } } } });
  if (!report || report.property.companyId !== companyId) throw new Error("Report not found");

  await prisma.qrIssueReport.update({ where: { id: reportId }, data: { status } });
  revalidatePath(`/dashboard/properties/${report.propertyId}`);
}
