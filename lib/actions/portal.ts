"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import { getEmailSignatureHtml, getEmailSignatureText } from "@/lib/emailSignature";

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
export async function inviteClient(prevState: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  try {
    const companyId = await requireStaff();

    const propertyId = String(formData.get("propertyId") || "");
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const relation = String(formData.get("relation") || "TENANT") as "TENANT" | "LANDLORD";

    if (!propertyId || !name || !email) return { error: "Name and email are required" };

    const property = await prisma.property.findFirst({ where: { id: propertyId, companyId } });
    if (!property) return { error: "Property not found" };

    let user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      if (user.role !== "CLIENT") return { error: "This email already belongs to a staff account" };
    } else {
      // A password is no longer required from staff when inviting someone - most tenants and
      // landlords never actually need to log in at all, since the real use case is just
      // getting sent a report. If staff don't provide one (or it's too short to be valid), a
      // secure random one is generated instead so the account still exists properly - if this
      // person ever does need to log in, "forgot password" already lets them set their own.
      const effectivePassword = password && password.length >= 8 ? password : crypto.randomBytes(24).toString("hex");
      const hashed = await bcrypt.hash(effectivePassword, 10);
      user = await prisma.user.create({ data: { name, email, role: "CLIENT", emailVerified: true } });
      await prisma.account.create({
        data: { userId: user.id, providerId: "credential", accountId: user.id, password: hashed },
      });
    }

    const existingAccess = await prisma.propertyAccess.findUnique({
      where: { userId_propertyId: { userId: user.id, propertyId } },
    });
    if (existingAccess) return { error: "This person already has access to this property" };

    const access = await prisma.propertyAccess.create({ data: { userId: user.id, propertyId, relation } });

    // Only link the specific report(s) staff actually selected - re-validated against this
    // exact property (and company) rather than trusting the submitted IDs directly, since a
    // modified request could otherwise submit an inspection ID from a different property.
    const selectedReportInspectionIds = formData.getAll("reportInspectionIds").map(String).filter(Boolean);
    let linkedReportsForEmail: { type: string; completedDate: Date | null; pdfUrl: string }[] = [];
    if (selectedReportInspectionIds.length > 0) {
      const validInspections = await prisma.inspection.findMany({
        where: { id: { in: selectedReportInspectionIds }, propertyId, property: { companyId }, report: { isNot: null } },
        select: { id: true, type: true, completedDate: true, report: { select: { pdfUrl: true } } },
      });
      if (validInspections.length > 0) {
        await prisma.propertyAccessReport.createMany({
          data: validInspections.map((i) => ({ propertyAccessId: access.id, inspectionId: i.id })),
        });
        linkedReportsForEmail = validInspections
          .filter((i) => i.report?.pdfUrl)
          .map((i) => ({ type: i.type, completedDate: i.completedDate, pdfUrl: i.report!.pdfUrl! }));
      }
    }

    // Doesn't fail the whole invite if only the email fails - the account and property access
    // were genuinely created either way, and an email delivery hiccup shouldn't undo that.
    // Logged server-side so a real, recurring failure is still visible for debugging.
    if (process.env.RESEND_API_KEY) {
      try {
        const fromAddress = process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>";
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://proptmate.zkmholdingslimited.com";
        const loginUrl = `${appUrl.replace(/\/$/, "")}/login`;
        const relationLabel = relation === "LANDLORD" ? "landlord" : "tenant";

        const reportsHtml =
          linkedReportsForEmail.length > 0
            ? `
              <p style="color: #25344A;">You've also been sent the following report(s):</p>
              <ul style="padding-left: 20px;">
                ${linkedReportsForEmail
                  .map(
                    (r) =>
                      `<li style="margin-bottom: 6px;"><a href="${r.pdfUrl}" style="color: #D96B44;">${r.type.replace(
                        /-/g,
                        " "
                      )} report${r.completedDate ? ` — ${formatDate(r.completedDate)}` : ""}</a></li>`
                  )
                  .join("")}
              </ul>
            `
            : "";

        const html = `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #25344A;">You've been given access</h2>
            <p style="color: #6B6A63;">${name}, you've been added as a ${relationLabel} for ${property.address}.</p>
            ${reportsHtml}
            <p>
              <a href="${loginUrl}" style="display:inline-block; background:#D96B44; color:#fff; padding:10px 20px; border-radius:24px; text-decoration:none; margin-top:12px;">
                Go to portal login
              </a>
            </p>
            ${getEmailSignatureHtml()}
            <p style="color: #999; font-size: 12px; margin-top: 24px;">Sent via ProptMate</p>
          </div>
        `;

        const reportsText =
          linkedReportsForEmail.length > 0
            ? "You've also been sent the following report(s):\n" +
              linkedReportsForEmail
                .map((r) => `- ${r.type.replace(/-/g, " ")} report${r.completedDate ? ` — ${formatDate(r.completedDate)}` : ""}: ${r.pdfUrl}`)
                .join("\n")
            : "";

        const text = [
          `You've been given access`,
          `${name}, you've been added as a ${relationLabel} for ${property.address}.`,
          ...(reportsText ? [reportsText] : []),
          `Go to portal login: ${loginUrl}`,
          getEmailSignatureText(),
          "Sent via ProptMate",
        ].join("\n\n");

        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: fromAddress,
            to: [email],
            subject: `You've been given access to ${property.address}`,
            html,
            text,
          }),
        });

        if (!res.ok) {
          console.error("Failed to send invite email:", await res.text());
        }
      } catch (err) {
        console.error("Failed to send invite email:", err);
      }
    } else {
      console.error("Invite email not sent - RESEND_API_KEY isn't configured.");
    }

    revalidatePath(`/dashboard/properties/${propertyId}`);
    revalidatePath("/dashboard/tenants");
    return {};
  } catch (err) {
    // redirect() (called inside requireStaff() for an unauthenticated user) works by
    // deliberately throwing a special signal Next.js's own framework needs to catch to
    // perform the actual redirect - without this check, this catch block would silently
    // swallow that signal instead, breaking the redirect to login entirely. Detected via its
    // documented `digest` property rather than an internal, undocumented import path.
    if (err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Something went wrong — please try again" };
  }
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
export async function updateClientProfile(prevState: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  try {
    const companyId = await requireStaff();

    const userId = String(formData.get("userId") || "");
    const propertyId = String(formData.get("propertyId") || "");
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();

    if (!name || !email) return { error: "Name and email are required" };

    // Confirm this user is actually linked to a property this company owns, before letting
    // staff edit them at all.
    const access = await prisma.propertyAccess.findFirst({ where: { userId, property: { companyId } } });
    if (!access) return { error: "This person isn't linked to any of your properties" };

    const emailTaken = await prisma.user.findFirst({ where: { email, NOT: { id: userId } } });
    if (emailTaken) return { error: "That email is already in use by another account" };

    await prisma.user.update({ where: { id: userId }, data: { name, email } });

    revalidatePath(`/dashboard/properties/${propertyId}`);
    revalidatePath("/dashboard/tenants");
    return {};
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Something went wrong — please try again" };
  }
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
    where: { id: inspectionId, property: { companyId }, deletedAt: null },
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
    where: { id: inspectionId, property: { companyId }, deletedAt: null },
  });
  if (!inspection) throw new Error("Inspection not found");

  await prisma.inspection.update({ where: { id: inspectionId }, data: { assignedClientId: clientUserId } });
}
