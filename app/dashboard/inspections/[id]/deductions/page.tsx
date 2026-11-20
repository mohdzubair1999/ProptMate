import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeCompanyId } from "@/lib/access";
import { defectsFromItems, linesFromDefects, parseDraft } from "@/lib/depositEstimate";
import DepositDraft from "./deposit-draft";

export const metadata = { title: "Deposit schedule (draft)" };

export default async function DeductionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  const inspection = await prisma.inspection.findFirst({
    where: { id, property: { companyId: scopeCompanyId(companyId) }, deletedAt: null },
    select: { id: true, type: true, depositDraft: true, property: { select: { address: true } }, items: { orderBy: [{ room: "asc" }, { itemName: "asc" }], take: 600, select: { id: true, room: true, itemName: true, condition: true, cleanliness: true, changeKind: true, changeSummary: true } } },
  });
  if (!inspection) notFound();
  const head = (
    <div className="print:hidden">
      <Link href={`/dashboard/inspections/${inspection.id}`} className="text-sm text-slate hover:text-ink">← Back to inspection</Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-2">Deposit schedule (draft)</h1>
    </div>
  );
  if (inspection.type !== "check-out") return <div>{head}<p className="mt-6 text-sm text-slate" data-testid="deductions-not-checkout">A deposit schedule is drafted from a check-out.</p></div>;

  const entries = await prisma.priceListItem.findMany({ where: { companyId: scopeCompanyId(companyId) }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true, keywords: true, pricePence: true, lifespanYears: true } });
  const saved = inspection.depositDraft ? parseDraft(inspection.depositDraft) : null;
  const lines = saved ?? linesFromDefects(defectsFromItems(inspection.items), entries);
  return (
    <div>
      {head}
      <p className="text-sm text-slate mt-1 print:hidden">{inspection.property.address}</p>
      <DepositDraft inspectionId={inspection.id} address={inspection.property.address} initialLines={lines} entries={entries} hasSaved={!!saved} />
    </div>
  );
}
