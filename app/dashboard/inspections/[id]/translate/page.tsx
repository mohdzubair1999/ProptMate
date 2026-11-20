import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeCompanyId } from "@/lib/access";
import TranslateReport from "./translate-report";

export const metadata = { title: "Translate report" };

export default async function TranslatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  const inspection = await prisma.inspection.findFirst({ where: { id, property: { companyId: scopeCompanyId(companyId) }, deletedAt: null }, select: { id: true, status: true, property: { select: { address: true } } } });
  if (!inspection) notFound();
  return (
    <div>
      <div className="print:hidden">
        <Link href={`/dashboard/inspections/${inspection.id}`} className="text-sm text-slate hover:text-ink">← Back to inspection</Link>
        <h1 className="font-display font-700 text-2xl text-ink mt-2">Translate report</h1>
        <p className="text-sm text-slate mt-1">{inspection.property.address}</p>
      </div>
      {inspection.status !== "completed" ? (
        <p className="mt-6 text-sm text-slate" data-testid="translate-not-complete">Complete the inspection first, then you can translate its report.</p>
      ) : (
        <TranslateReport inspectionId={inspection.id} />
      )}
    </div>
  );
}
