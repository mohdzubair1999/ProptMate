import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { buildZip, type ZipEntry } from "@/lib/zipStore";
import { PDF_LIMITS, exportSheets, pdfPlan, readme } from "@/lib/dataExport";
import { safeFileName } from "@/lib/csv";
import { logAuditEvent } from "@/lib/auditLog";

export const maxDuration = 60;

// One download of a company's properties, inspections, items, photo links, compliance documents and report PDFs (or just one property's, with ?propertyId=).
// Admins and Managers only: it is everything the company holds.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const u = session.user as any;
  const companyId = u.companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });
  if (u.role !== "ADMIN" && u.role !== "MANAGER") return NextResponse.json({ error: "Only an Admin or Manager can download all the company's data." }, { status: 403 });
  const limit = await checkRateLimit(`export-all:${companyId}`, 4, 60);
  if (!limit.allowed) return NextResponse.json({ error: "A full download was made a few times already - please wait a while and try again." }, { status: 429 });

  const propertyId = new URL(req.url).searchParams.get("propertyId") || "";
  if (propertyId.length > 60) return NextResponse.json({ error: "Missing details" }, { status: 400 });
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
  const props = await prisma.property.findMany({ where: { companyId, ...(propertyId ? { id: propertyId } : {}) }, select: { id: true, address: true, city: true, postcode: true, type: true, bedrooms: true, landlordName: true, archivedAt: true, createdAt: true }, orderBy: { address: "asc" }, take: 2000 });
  if (propertyId && props.length === 0) return NextResponse.json({ error: "Property not found" }, { status: 404 });
  const ids = props.map((p) => p.id);
  const [inspections, compliance] = await Promise.all([
    prisma.inspection.findMany({
      where: { deletedAt: null, propertyId: { in: ids } }, orderBy: { createdAt: "desc" }, take: 5000,
      select: { id: true, propertyId: true, type: true, status: true, scheduledDate: true, completedDate: true, createdAt: true, report: { select: { pdfUrl: true } }, items: { select: { room: true, itemName: true, condition: true, cleanliness: true, make: true, quantity: true, notes: true, photos: { select: { url: true }, take: 50 } }, take: 3000 } },
    }),
    prisma.complianceDocument.findMany({ where: { propertyId: { in: ids } }, select: { propertyId: true, type: true, otherTypeLabel: true, certificateNumber: true, issueDate: true, expiryDate: true, documentUrl: true }, take: 5000 }),
  ]);

  const entries: ZipEntry[] = Object.entries(exportSheets(props, inspections, compliance)).map(([name, text]) => ({ name, data: Buffer.from(text, "utf8") }));
  const plan = pdfPlan(inspections, props);
  let bytes = 0, included = 0;
  for (let i = 0; i < plan.length && included < PDF_LIMITS.files; i += 4) {
    const batch = plan.slice(i, i + 4);
    const got = await Promise.all(batch.map(async (f) => { try { const r = await fetch(f.url, { signal: AbortSignal.timeout(15000) }); return r.ok ? { f, buf: Buffer.from(await r.arrayBuffer()) } : null; } catch { return null; } }));
    for (const g of got) { if (!g || included >= PDF_LIMITS.files || bytes + g.buf.length > PDF_LIMITS.bytes) continue; entries.push({ name: g.f.name, data: g.buf }); bytes += g.buf.length; included++; }
  }
  entries.push({ name: "README.txt", data: Buffer.from(readme({ company: company?.name ?? "your company", when: new Date(), pdfsIncluded: included, pdfsTotal: plan.length }), "utf8") });
  await logAuditEvent({ companyId, userId: u.id, userEmail: u.email, action: "data.exported", entityType: "Company", entityId: companyId, description: propertyId ? `Downloaded the data for one property` : `Downloaded all the company's data` });

  const zip = buildZip(entries);
  const name = `proptmate-${safeFileName(propertyId ? props[0].address : company?.name ?? "data", "data")}-${new Date().toISOString().slice(0, 10)}.zip`;
  return new NextResponse(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
