import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeCompanyId } from "@/lib/access";
import WalkthroughRecorder from "./walkthrough-recorder";

export const metadata = { title: "Voice walk-through" };

export default async function WalkthroughPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  const inspection = await prisma.inspection.findFirst({
    where: { id, property: { companyId: scopeCompanyId(companyId) }, deletedAt: null },
    select: { id: true, status: true, templateId: true, property: { select: { address: true } }, items: { select: { room: true }, take: 600 } },
  });
  if (!inspection) notFound();
  const fields = inspection.templateId
    ? await prisma.templateField.findMany({ where: { type: "INVENTORY_SECTION", section: { templateId: inspection.templateId } }, select: { id: true, label: true }, orderBy: [{ section: { order: "asc" } }, { order: "asc" }], take: 100 })
    : [];
  const rooms = inspection.templateId ? fields.map((f) => ({ name: f.label, templateFieldId: f.id as string | null })) : [...new Set(inspection.items.map((i) => i.room))].map((r) => ({ name: r, templateFieldId: null as string | null }));
  return (
    <div>
      <Link href={`/dashboard/inspections/${inspection.id}`} className="text-sm text-slate hover:text-ink">← Back to inspection</Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-2">Voice walk-through</h1>
      <p className="text-sm text-slate mt-1">{inspection.property.address}</p>
      {inspection.status !== "draft" ? (
        <p className="mt-6 text-sm text-slate" data-testid="walkthrough-completed">This inspection is completed, so items can't be added by voice.</p>
      ) : (
        <WalkthroughRecorder inspectionId={inspection.id} rooms={rooms} freeRoom={!inspection.templateId} />
      )}
    </div>
  );
}
