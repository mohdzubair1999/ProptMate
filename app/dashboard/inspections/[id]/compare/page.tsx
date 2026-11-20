import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeCompanyId } from "@/lib/access";
import { findMatchingCheckInInspection } from "@/lib/findMatchingCheckIn";
import CompareRunner, { type CompareRow } from "./compare-runner";

export const metadata = { title: "Compare with check-in" };

export default async function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  const inspection = await prisma.inspection.findFirst({
    where: { id, property: { companyId: scopeCompanyId(companyId) }, deletedAt: null },
    select: {
      id: true, type: true, propertyId: true, comparedToInspectionId: true, completedDate: true, property: { select: { address: true } },
      items: { orderBy: [{ room: "asc" }, { itemName: "asc" }], take: 600, select: { id: true, room: true, itemName: true, changeKind: true, changeSummary: true, changeSeverity: true, changeConfidence: true, photos: { select: { url: true }, orderBy: { timestamp: "asc" }, take: 4 } } },
    },
  });
  if (!inspection) notFound();
  const back = (
    <>
      <Link href={`/dashboard/inspections/${inspection.id}`} className="text-sm text-slate hover:text-ink">← Back to inspection</Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-2">Compare with check-in</h1>
      <p className="text-sm text-slate mt-1">{inspection.property.address}</p>
    </>
  );
  if (inspection.type === "check-in") return <div>{back}<p className="mt-6 text-sm text-slate" data-testid="compare-not-checkout">This is a check-in. Open a check-out or a later inspection to compare it with the check-in.</p></div>;

  const checkIn = await findMatchingCheckInInspection(inspection, companyId);
  if (!checkIn) return <div>{back}<p className="mt-6 text-sm text-slate" data-testid="compare-no-checkin">No completed check-in was found for this property, so there is nothing to compare with.</p></div>;
  const before = await prisma.inspectionItem.findMany({ where: { inspectionId: checkIn.id }, select: { room: true, itemName: true, photos: { select: { url: true }, orderBy: { timestamp: "asc" }, take: 4 } }, take: 1000 });
  const key = (r: string, n: string) => `${r.trim().toLowerCase()}|${n.trim().toLowerCase()}`;
  const byKey = new Map(before.map((b) => [key(b.room, b.itemName), b.photos.map((p) => p.url)]));
  const rows: CompareRow[] = inspection.items.map((i) => ({
    id: i.id, room: i.room, itemName: i.itemName, afterUrls: i.photos.map((p) => p.url), beforeUrls: byKey.get(key(i.room, i.itemName)) ?? [],
    kind: i.changeKind, summary: i.changeSummary, severity: i.changeSeverity, confidence: i.changeConfidence,
  }));
  return (
    <div>
      {back}
      <CompareRunner inspectionId={inspection.id} rows={rows} />
    </div>
  );
}
