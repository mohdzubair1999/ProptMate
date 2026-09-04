"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getEmailSignatureHtml, getEmailSignatureText } from "@/lib/emailSignature";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";

async function requireStaff() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) throw new Error("No company associated with this account");
  return companyId;
}

function isRedirectSignal(err: unknown): boolean {
  return !!(err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT"));
}

// Sends a report to one or more recipients asking them to confirm they received it, each
// getting their own unique link and their own separate confirmation record - a property with
// several tenants needs each of them to individually confirm, not just "someone."
export async function sendReportForAcknowledgement(
  prevState: { error?: string; sent?: number } | undefined,
  formData: FormData
): Promise<{ error?: string; sent?: number }> {
  try {
    const companyId = await requireStaff();
    const inspectionId = String(formData.get("inspectionId") || "");

    // Recipients come in as parallel "recipientEmails" / "recipientNames" arrays (one entry
    // per row in the UI) rather than a single combined field, since each recipient needs
    // their own name captured alongside their email - unlike the free-text, comma-separated
    // list used for a plain "just email me the PDF" send, which never needed individual names.
    const recipientEmails = formData.getAll("recipientEmails").map(String);
    const recipientNames = formData.getAll("recipientNames").map(String);
    const recipients = recipientEmails
      .map((email, i) => ({ email: email.trim(), name: (recipientNames[i] || "").trim() }))
      .filter((r) => r.email && r.name);

    if (recipients.length === 0) return { error: "Add at least one recipient with a name and email" };

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalid = recipients.find((r) => !EMAIL_PATTERN.test(r.email));
    if (invalid) return { error: `Not a valid email address: ${invalid.email}` };

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, property: { companyId }, deletedAt: null },
      include: { property: true, report: true },
    });
    if (!inspection) return { error: "Inspection not found" };
    if (!inspection.report?.pdfUrl) return { error: "Generate the report before sending it for confirmation" };

    if (!process.env.RESEND_API_KEY) return { error: "Email isn't configured yet — add RESEND_API_KEY to your environment." };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://proptmate.zkmholdingslimited.com";
    const fromAddress = process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>";
    const displayName = inspectionTypeDisplayName(inspection.type);

    let sentCount = 0;
    for (const recipient of recipients) {
      // Re-sending to someone who already has a record for this inspection reuses their
      // existing token and resets sentAt, rather than creating a second, parallel one -
      // there's only ever meant to be one active confirmation link per person per inspection.
      const ack = await prisma.reportAcknowledgement.upsert({
        where: { inspectionId_recipientEmail: { inspectionId, recipientEmail: recipient.email } },
        update: {
          recipientName: recipient.name,
          pdfUrlSnapshot: inspection.report.pdfUrl,
          sentAt: new Date(),
          // A fresh send means a fresh confirmation is required - without this, someone who
          // confirmed an earlier version of the report would still show as "confirmed" after
          // being sent a newer one they never actually saw or signed for.
          confirmedAt: null,
          confirmedName: null,
          signatureDataUrl: null,
          ipAddress: null,
        },
        create: {
          inspectionId,
          recipientEmail: recipient.email,
          recipientName: recipient.name,
          token: crypto.randomBytes(32).toString("hex"),
          pdfUrlSnapshot: inspection.report.pdfUrl,
        },
      });

      const confirmUrl = `${appUrl.replace(/\/$/, "")}/confirm/${ack.token}`;

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #25344A;">${displayName}</h2>
          <p style="color: #6B6A63;">${inspection.property.address}</p>
          <p style="color: #25344A;">Hi ${recipient.name}, please open the link below to view your report and confirm you've received it.</p>
          <p>
            <a href="${confirmUrl}" style="display:inline-block; background:#D96B44; color:#fff; padding:10px 20px; border-radius:24px; text-decoration:none; margin-top:12px;">
              View report and confirm receipt
            </a>
          </p>
          ${getEmailSignatureHtml()}
          <p style="color: #999; font-size: 12px; margin-top: 24px;">Sent via ProptMate</p>
        </div>
      `;

      const text = [
        `${displayName}\n${inspection.property.address}`,
        `Hi ${recipient.name}, please open the link below to view your report and confirm you've received it.`,
        `View report and confirm receipt: ${confirmUrl}`,
        getEmailSignatureText(),
        "Sent via ProptMate",
      ].join("\n\n");

      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
          body: JSON.stringify({
            from: fromAddress,
            to: [recipient.email],
            subject: `Please confirm receipt: ${displayName} — ${inspection.property.address}`,
            html,
            text,
          }),
        });
        if (res.ok) sentCount++;
        else console.error(`Failed to send acknowledgement email to ${recipient.email}:`, await res.text());
      } catch (err) {
        console.error(`Failed to send acknowledgement email to ${recipient.email}:`, err);
      }
    }

    revalidatePath(`/dashboard/inspections/${inspectionId}`);

    if (sentCount === 0) return { error: "Failed to send to anyone — please try again" };
    return { sent: sentCount };
  } catch (err) {
    if (isRedirectSignal(err)) throw err;
    return { error: err instanceof Error ? err.message : "Something went wrong — please try again" };
  }
}

// Records a confirmation from the public, no-login page. The token itself is the only
// authentication this needs - a long, cryptographically random value nobody could guess, so
// knowing it is treated as proof this is genuinely the person the link was sent to.
export async function confirmReceipt(
  prevState: { error?: string; success?: boolean } | undefined,
  formData: FormData
): Promise<{ error?: string; success?: boolean }> {
  const token = String(formData.get("token") || "");
  const confirmedName = String(formData.get("confirmedName") || "").trim();
  const signatureDataUrl = String(formData.get("signatureDataUrl") || "");

  if (!token) return { error: "Invalid or missing confirmation link" };
  if (!confirmedName) return { error: "Please type your name to confirm" };
  if (!signatureDataUrl) return { error: "Please sign before confirming" };

  const ack = await prisma.reportAcknowledgement.findUnique({ where: { token }, include: { inspection: { select: { deletedAt: true } } } });
  if (!ack || ack.inspection.deletedAt) return { error: "This confirmation link isn't valid" };
  if (ack.confirmedAt) return { error: "This has already been confirmed" };

  const headerList = await headers();
  // x-forwarded-for can contain a chain of proxy hops (client, then any intermediaries) -
  // the first entry is the original client, which is what's actually meaningful to record.
  const ipAddress = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  await prisma.reportAcknowledgement.update({
    where: { token },
    data: { confirmedAt: new Date(), confirmedName, signatureDataUrl, ipAddress },
  });

  revalidatePath(`/dashboard/inspections/${ack.inspectionId}`);
  return { success: true };
}
