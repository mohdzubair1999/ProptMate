import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TYPE_LABELS, DOCUMENT_DEFAULTS } from "@/lib/complianceDocumentTypes";
import { computeNextInspection } from "@/lib/inspectionScheduling";

// How many days before an inspection's due date to send the first warning — there's no
// existing per-property equivalent of compliance's warnDays, so this is a single sensible
// default rather than something configurable per property.
const INSPECTION_WARN_DAYS = 14;

// The final compliance warning fires at this many days before expiry, not on the expiry date
// itself — an alert that only arrives the day something expires gives no real time to act on
// it. This applies across every document type, regardless of that type's initial warnDays.
const FINAL_WARNING_DAYS = 15;

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / msPerDay);
}

async function sendAlertEmail(to: string[], subject: string, bodyLines: string[]) {
  if (!process.env.RESEND_API_KEY || to.length === 0) return;
  const fromAddress = process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to,
      subject,
      text: bodyLines.join("\n"),
    }),
  });
  if (!res.ok) {
    console.error("Resend error (compliance alert):", await res.text());
  }
}

export async function GET(request: NextRequest) {
  // Vercel sends this automatically on every real cron invocation — without checking it,
  // anyone who found this URL could trigger the job (and the emails) on demand.
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = startOfDay(new Date());
  let alertsSent = 0;

  const companies = await prisma.company.findMany({
    include: {
      users: { where: { role: "ADMIN" }, select: { email: true } },
      properties: {
        include: {
          complianceDocuments: true,
          inspections: {
            orderBy: { createdAt: "desc" },
            select: { status: true, completedDate: true, scheduledDate: true },
          },
        },
      },
    },
  });

  for (const company of companies) {
    const adminEmails = company.users.map((u) => u.email);
    if (adminEmails.length === 0) continue; // Nobody to notify — skip the work entirely.

    const complianceLines: string[] = [];
    const inspectionLines: string[] = [];

    for (const property of company.properties) {
      for (const doc of property.complianceDocuments) {
        if (!doc.expiryDate) continue;
        const daysUntilExpiry = daysBetween(today, doc.expiryDate);
        const warnDays = DOCUMENT_DEFAULTS[doc.type]?.warnDays ?? 30;
        const label = TYPE_LABELS[doc.type] || doc.type;

        // Alert on exactly two points: the type's configured warning threshold, and the
        // expiry date itself — not a range, so this fires once per document per event
        // rather than every single day in between (which would be spam).
        // Exact-day match, not a range — a wider window sounds safer against a missed cron
        // run, but since this runs once daily and days decrement by exactly 1, any window
        // wider than a single day gets hit on two consecutive days under completely normal
        // operation, guaranteeing a duplicate email every time rather than just occasionally
        // covering for a missed run. A genuinely missed-run-safe version needs to track
        // "already alerted" state, which needs a schema change — worth doing as a deliberate
        // follow-up, not smuggled in here as a one-line tweak.
        if (daysUntilExpiry === warnDays) {
          complianceLines.push(`- ${label} for ${property.address} expires in ${warnDays} days (${doc.expiryDate.toLocaleDateString("en-GB")}).`);
        } else if (daysUntilExpiry === FINAL_WARNING_DAYS && warnDays !== FINAL_WARNING_DAYS) {
          complianceLines.push(`- ${label} for ${property.address} expires in ${FINAL_WARNING_DAYS} days (${doc.expiryDate.toLocaleDateString("en-GB")}) — final reminder.`);
        }
      }

      const next = computeNextInspection(property.inspections, property.inspectionFrequencyMonths);
      if (next?.date) {
        const daysUntilDue = daysBetween(today, next.date);
        if (daysUntilDue === INSPECTION_WARN_DAYS) {
          inspectionLines.push(`- ${property.address} is due for inspection in ${INSPECTION_WARN_DAYS} days (${next.date.toLocaleDateString("en-GB")}).`);
        } else if (daysUntilDue === 0) {
          inspectionLines.push(`- ${property.address} is due for inspection TODAY (${next.date.toLocaleDateString("en-GB")}).`);
        }
      }
    }

    if (complianceLines.length > 0) {
      await sendAlertEmail(adminEmails, "ProptMate: Compliance documents need attention", [
        "The following compliance documents need attention:",
        "",
        ...complianceLines,
        "",
        "Review them at https://proptmate.zkmholdingslimited.com/dashboard/compliance",
      ]);
      alertsSent += complianceLines.length;
    }

    if (inspectionLines.length > 0) {
      await sendAlertEmail(adminEmails, "ProptMate: Inspections due", [
        "The following properties are due for inspection:",
        "",
        ...inspectionLines,
        "",
        "Review them at https://proptmate.zkmholdingslimited.com/dashboard/properties",
      ]);
      alertsSent += inspectionLines.length;
    }
  }

  return NextResponse.json({ ok: true, companiesChecked: companies.length, alertsSent });
}
