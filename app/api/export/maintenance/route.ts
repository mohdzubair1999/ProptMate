import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { formatDate } from "@/lib/formatDate";
import { loadPropertyJobs } from "@/lib/maintenanceJobs";
import { safeFileName } from "@/lib/csv";
import { csvResponse } from "@/lib/csvResponse";

const URGENCY: Record<string, string> = { urgent: "Urgent", "28-days": "Within 28 days", routine: "Routine", monitor: "Monitor" };
const STATUS: Record<string, string> = { open: "Open", in_progress: "In progress", done: "Done" };

// A property's tracked maintenance jobs as a spreadsheet (CSV). Staff of the same company only.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });
  const propertyId = new URL(req.url).searchParams.get("propertyId") ?? "";
  if (!propertyId || propertyId.length > 60) return NextResponse.json({ error: "Missing details" }, { status: 400 });
  const limit = await checkRateLimit(`export:${session.user.id}`, 20, 15);
  if (!limit.allowed) return NextResponse.json({ error: "That's a lot of downloads in a short time - please wait a few minutes and try again." }, { status: 429 });

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId }, select: { address: true } });
  if (!property) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  const jobs = await loadPropertyJobs(propertyId, companyId);
  if (jobs.length === 0) return NextResponse.json({ error: "There are no tracked jobs to export." }, { status: 400 });

  const rows: unknown[][] = [["Property", "Urgency", "Timeframe", "Area", "Job", "Status", "Found", "Done", "Last confirmed still there"]];
  for (const j of jobs) rows.push([property.address, URGENCY[j.urgency] ?? j.urgency, j.timeframe, j.area, j.text, STATUS[j.status] ?? j.status, formatDate(j.createdAt), j.resolvedAt ? formatDate(j.resolvedAt) : "", j.status !== "done" && j.lastSeenAt ? formatDate(j.lastSeenAt) : ""]);
  return csvResponse(`maintenance-jobs-${safeFileName(property.address, "property")}`, rows);
}
