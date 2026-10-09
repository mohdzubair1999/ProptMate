import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import NewInspectionForm from "./new-inspection-form";

export default async function NewInspectionPage({ searchParams }: { searchParams: Promise<{ propertyId?: string }> }) {
  const params = await searchParams;
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;

  const properties = companyId ? await prisma.property.findMany({ where: { companyId }, orderBy: { address: "asc" } }) : [];
  const templates = companyId ? await prisma.template.findMany({ where: { companyId }, orderBy: { name: "asc" } }) : [];

  return (
    <main className="max-w-lg">
      <Link href="/dashboard/inspections" className="text-sm text-slate hover:text-ink">
        ← Back to inspections
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">New inspection</h1>

      {properties.length === 0 ? (
        <section className="mt-8 bg-white border border-line rounded-xl p-8 text-center">
          <p className="text-slate text-sm">You need a property before you can create an inspection.</p>
          <Link href="/dashboard/properties/new" className="inline-block mt-4 text-sm text-ink underline">
            Add a property
          </Link>
        </section>
      ) : (
        <NewInspectionForm properties={properties} templates={templates} initialPropertyId={params.propertyId || ""} />
      )}
    </main>
  );
}
