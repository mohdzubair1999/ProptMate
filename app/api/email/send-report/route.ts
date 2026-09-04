import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";
import { getEmailSignatureHtml, getEmailSignatureText } from "@/lib/emailSignature";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const companyId = (session.user as any).companyId as string | null;

  const { inspectionId, recipientEmails, message } = await req.json();

  if (!inspectionId || !Array.isArray(recipientEmails) || recipientEmails.length === 0) {
    return NextResponse.json({ error: "Missing inspection or recipient email" }, { status: 400 });
  }

  // Simple, pragmatic format check rather than full RFC validation — catches an obviously
  // malformed address with a clear, specific error, rather than letting the whole send fail
  // later with a less helpful message from Resend once every address is already bundled
  // into one request.
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalidEmails = recipientEmails.filter((e: string) => typeof e !== "string" || !EMAIL_PATTERN.test(e));
  if (invalidEmails.length > 0) {
    return NextResponse.json({ error: `Not a valid email address: ${invalidEmails.join(", ")}` }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email isn't configured yet — add RESEND_API_KEY to your environment." }, { status: 503 });
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
    include: { property: true, report: true, template: true },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }
  if (!inspection.report?.pdfUrl) {
    return NextResponse.json({ error: "Generate the report before sending it" }, { status: 400 });
  }

  const reportName = inspection.template?.name || `${inspection.type} inspection report`;
  const fromAddress = process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>";
  const filename = `${reportName.replace(/[^a-z0-9]+/gi, "-")}.pdf`;
  // A cleaner, tenant-facing name for the subject/heading — the raw template name (e.g.
  // "Inventory: 3-bed house (unfurnished)") is accurate internal terminology, but reads like
  // a system label rather than a polished document title to someone outside the company.
  const displayName = inspectionTypeDisplayName(inspection.type);

  // Resend rejects the whole email if content + attachment together exceed 40MB. Check the
  // actual PDF size first via a HEAD request (cheap — no need to download the file) and only
  // attach it if safely under a conservative threshold, well below Resend's stated limit to
  // leave margin for uncertainty in exactly how they measure it. If the size can't be
  // determined at all, default to not attaching rather than risk the same failure blind.
  const ATTACHMENT_SIZE_LIMIT_BYTES = 25 * 1024 * 1024; // 25MB
  let canAttach = false;
  try {
    const headRes = await fetch(inspection.report.pdfUrl, { method: "HEAD" });
    const contentLength = headRes.headers.get("content-length");
    if (contentLength && Number(contentLength) <= ATTACHMENT_SIZE_LIMIT_BYTES) {
      canAttach = true;
    }
  } catch (err) {
    console.error("Failed to check PDF size before sending — will send without attaching:", err);
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #25344A;">${displayName}</h2>
      <p style="color: #6B6A63;">${inspection.property.address}</p>
      ${message ? `<p>${message}</p>` : ""}
      <p style="color: #6B6A63; font-size: 13px;">${canAttach ? "The full report is attached as a PDF, or you can view it online below." : "This report is too large to attach directly — view or download it online below."}</p>
      <p>
        <a href="${inspection.report.pdfUrl}" style="display:inline-block; background:#D96B44; color:#fff; padding:10px 20px; border-radius:24px; text-decoration:none; margin-top:12px;">
          View report online
        </a>
      </p>
      ${getEmailSignatureHtml()}
      <p style="color: #999; font-size: 12px; margin-top: 24px;">Sent via ProptMate</p>
    </div>
  `;

  const text = [
    `${displayName}\n${inspection.property.address}`,
    ...(message ? [message] : []),
    canAttach ? "The full report is attached as a PDF, or you can view it online below." : "This report is too large to attach directly — view or download it online below.",
    `View report online: ${inspection.report.pdfUrl}`,
    getEmailSignatureText(),
    "Sent via ProptMate",
  ].join("\n\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: recipientEmails,
        subject: `${displayName} — ${inspection.property.address}`,
        html,
        text,
        // Resend fetches the file directly from this URL and attaches it — no need to
        // download and base64-encode it ourselves. Omitted entirely when the size check
        // above couldn't confirm it's safely under the limit.
        ...(canAttach ? { attachments: [{ path: inspection.report.pdfUrl, filename }] } : {}),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error:", errText);
      return NextResponse.json({ error: "Failed to send email" }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to send email" }, { status: 500 });
  }
}
