import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { TYPE_LABELS, DOCUMENT_DEFAULTS } from "@/lib/complianceDocumentTypes";
import { computeNextInspection } from "@/lib/inspectionScheduling";
import { decideReminder, describeDue, type ReminderKind } from "@/lib/inspectionReminders";

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

// Returns true only if the email really went out (so callers can remember what has been sent, and retry what has not).
// the most properties listed in one reminder email for one company
const MAX_REMINDERS_PER_RUN = 25;

async function sendAlertEmail(to: string[], subject: string, bodyLines: string[]): Promise<boolean> {
  if (!process.env.RESEND_API_KEY || to.length === 0) return false;
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
    return false;
  }
  return true;
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
      // Admins and Managers are told (inspectors are not: they do not run the company's schedule)
      users: { where: { role: { in: ["ADMIN", "MANAGER"] } }, select: { email: true } },
      properties: {
        include: {
          complianceDocuments: true,
          inspections: {
            // a deleted inspection must not decide when the next one is due (or hide that there is nothing in progress)
            where: { deletedAt: null },
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
    // each property due a reminder, with the state to remember once the email has gone out
    const inspectionDue: { propertyId: string; kind: ReminderKind; line: string; due: Date; stage: number; daysUntil: number }[] = [];

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

      // Inspection reminders remember what each property has already been told for its current due date, so each one (due soon, due now or
      // overdue, two weeks overdue) is sent once, a missed daily run is caught up, and a property that goes overdue is told so.
      const next = computeNextInspection(property.inspections, property.inspectionFrequencyMonths);
      if (next?.date) {
        const decision = decideReminder(next.date, { due: property.inspectionReminderDue ?? null, stage: property.inspectionReminderStage ?? 0 }, today);
        if (decision.send) inspectionDue.push({ propertyId: property.id, kind: decision.send, line: describeDue(decision.send, property.address, next.date, decision.daysUntil), due: decision.state.due!, stage: decision.state.stage, daysUntil: decision.daysUntil });
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

    if (inspectionDue.length > 0) {
      // At most MAX_REMINDERS_PER_RUN properties go in one email, the most overdue first. Only those are marked as reminded, so the rest are
      // simply told on the next runs: the first email after this was introduced is not a flood of every overdue property at once.
      const KIND_ORDER = { overdue: 0, due: 1, soon: 2 } as const;
      inspectionDue.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.daysUntil - b.daysUntil);
      const waiting = Math.max(0, inspectionDue.length - MAX_REMINDERS_PER_RUN);
      inspectionDue.length = Math.min(inspectionDue.length, MAX_REMINDERS_PER_RUN);
      const section = (kind: ReminderKind, heading: string) => {
        const lines = inspectionDue.filter((d) => d.kind === kind).map((d) => d.line);
        return lines.length ? [heading, ...lines, ""] : [];
      };
      const overdueOnly = inspectionDue.every((d) => d.kind !== "soon");
      const sent = await sendAlertEmail(adminEmails, overdueOnly ? "ProptMate: Inspections overdue" : "ProptMate: Inspections due", [
        ...section("overdue", "Two weeks or more overdue:"),
        ...section("due", "Due now or overdue:"),
        ...section("soon", "Coming up:"),
        ...(waiting > 0 ? [`${waiting} more propert${waiting === 1 ? "y is" : "ies are"} also due and will be listed in the next few days' emails.`, ""] : []),
        "Review them at https://proptmate.zkmholdingslimited.com/dashboard/properties",
      ]);
      // Only once the email has really gone out is each property marked as reminded; a failed send (or no email service set up) is
      // simply tried again on the next run.
      if (sent) {
        for (const d of inspectionDue) await prisma.property.update({ where: { id: d.propertyId }, data: { inspectionReminderDue: d.due, inspectionReminderStage: d.stage } });
        alertsSent += inspectionDue.length;
      }
    }
  }

  return NextResponse.json({ ok: true, companiesChecked: companies.length, alertsSent });
}
