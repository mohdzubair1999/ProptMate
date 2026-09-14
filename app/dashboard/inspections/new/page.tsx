import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createInspection } from "@/lib/actions/inspections";

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
        <form action={createInspection} className="mt-8 space-y-4">
          <div>
            <label className="text-sm text-slate">Property</label>
            <select name="propertyId" required defaultValue={params.propertyId || ""} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
              <option value="" disabled>
                Select a property
              </option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-slate">Type</label>
            <select name="type" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
              <option value="check-in">Check-in</option>
              <option value="check-out">Check-out</option>
              <option value="mid-term">Mid-term</option>
              <option value="hmo">HMO</option>
              <option value="legionella">Legionella</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <div>
            <label className="text-sm text-slate">Template (optional)</label>
            <select name="templateId" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
              <option value="">No template — freeform rooms &amp; items</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.propertyType ? `(${t.propertyType})` : ""}
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="text-xs text-slate mt-1">
                No templates yet —{" "}
                <a href="/dashboard/settings/templates/new" className="underline">
                  build one
                </a>{" "}
                to use structured sections instead.
              </p>
            )}
          </div>

          <div>
            <label className="text-sm text-slate">Scheduled date (optional)</label>
            <input name="scheduledDate" type="date" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>

          <button type="submit" className="bg-signal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            Create inspection
          </button>
        </form>
      )}
    </main>
  );
}
