import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const companyId = (session.user as any).companyId as string | null;

  const { inspectionId, recipientEmail, message } = await req.json();

  if (!inspectionId || !recipientEmail) {
    return NextResponse.json({ error: "Missing inspection or recipient email" }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "Email isn't configured yet — add RESEND_API_KEY to your environment." }, { status: 503 });
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined } },
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

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="color: #25344A;">${reportName}</h2>
      <p style="color: #6B6A63;">${inspection.property.address}</p>
      ${message ? `<p>${message}</p>` : ""}
      <p style="color: #6B6A63; font-size: 13px;">The full report is attached as a PDF, or you can view it online below.</p>
      <p>
        <a href="${inspection.report.pdfUrl}" style="display:inline-block; background:#D96B44; color:#fff; padding:10px 20px; border-radius:24px; text-decoration:none; margin-top:12px;">
          View report online
        </a>
      </p>
      <p style="color: #999; font-size: 12px; margin-top: 24px;">Sent via ProptMate</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipientEmail],
        subject: `${reportName} — ${inspection.property.address}`,
        html,
        // Resend fetches the file directly from this URL and attaches it — no need to
        // download and base64-encode it ourselves.
        attachments: [{ path: inspection.report.pdfUrl, filename }],
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
