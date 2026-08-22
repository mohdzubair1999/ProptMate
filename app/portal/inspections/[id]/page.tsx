import { getSession } from "@/lib/session";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { TemplateInspectionView } from "@/app/dashboard/inspections/[id]/template-view";
import { completeInspection } from "@/lib/actions/inspections";

export default async function PortalInspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const userId = session!.user.id as string;

  // Only the person this was actually assigned to can see it — not just any client account,
  // and not by guessing an inspection id.
  const inspection = await prisma.inspection.findFirst({
    where: { id, assignedClientId: userId },
    include: { property: true, template: true },
  });

  if (!inspection) notFound();

  const isDraft = inspection.status === "draft";

  return (
    <div>
      <Link href="/portal" className="text-sm text-slate hover:text-ink">
        ← Back
      </Link>

      <h1 className="font-display font-700 text-2xl text-ink mt-4 capitalize">
        {inspection.type.replace("-", " ")}
      </h1>
      <p className="text-sm text-slate mt-1">{inspection.property.address}</p>

      {inspection.templateId ? (
        <TemplateInspectionView inspectionId={inspection.id} templateId={inspection.templateId} isDraft={isDraft} />
      ) : (
        <p className="text-sm text-slate mt-8">This form isn't set up correctly — please contact your letting agent.</p>
      )}

      {isDraft && (
        <form action={completeInspection} className="mt-8">
          <input type="hidden" name="inspectionId" value={inspection.id} />
          <button type="submit" className="bg-verified text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            Submit
          </button>
        </form>
      )}

      {!isDraft && (
        <p className="mt-8 text-sm text-verified">✓ Submitted — thank you.</p>
      )}
    </div>
  );
}
