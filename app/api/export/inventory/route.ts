import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { formatDate } from "@/lib/formatDate";
import { cleanlinessLabel, conditionLabel } from "@/lib/disputePack";
import { safeFileName } from "@/lib/csv";
import { csvResponse } from "@/lib/csvResponse";

const MAX_ITEMS = 5000;

// An inspection's inventory items as a spreadsheet (CSV): one row per item, with the property, inspection type and date on every row so
// sheets from several inspections can be combined and filtered. Staff of the same company only. Only inventory items are included:
// answers to other template questions are not items.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });
  const inspectionId = new URL(req.url).searchParams.get("inspectionId") ?? "";
  if (!inspectionId || inspectionId.length > 60) return NextResponse.json({ error: "Missing details" }, { status: 400 });
  const limit = await checkRateLimit(`export:${session.user.id}`, 20, 15);
  if (!limit.allowed) return NextResponse.json({ error: "That's a lot of downloads in a short time - please wait a few minutes and try again." }, { status: 429 });

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, deletedAt: null, property: { companyId } },
    select: {
      type: true, completedDate: true, createdAt: true, property: { select: { address: true } },
      items: { select: { room: true, itemName: true, condition: true, cleanliness: true, make: true, quantity: true, notes: true, _count: { select: { photos: true } } }, orderBy: { id: "asc" }, take: MAX_ITEMS },
    },
  });
  if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (inspection.items.length === 0) return NextResponse.json({ error: "This inspection has no inventory items to export." }, { status: 400 });

  const date = formatDate(inspection.completedDate ?? inspection.createdAt);
  const rows: unknown[][] = [["Property", "Inspection type", "Date", "Room", "Item", "Condition", "Cleanliness", "Make", "Quantity", "Notes", "Photos"]];
  for (const it of inspection.items) rows.push([inspection.property.address, inspection.type, date, it.room, it.itemName, conditionLabel(it.condition), cleanlinessLabel(it.cleanliness), it.make, it.quantity, it.notes, it._count.photos]);
  return csvResponse(`inventory-${safeFileName(inspection.property.address, "property")}-${inspection.type}`, rows);
}
