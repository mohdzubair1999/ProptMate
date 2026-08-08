import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DashboardInstallBanner from "./dashboard-install-banner";

export default async function Dashboard() {
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;

  const propertyCount = companyId ? await prisma.property.count({ where: { companyId } }) : 0;
  const inspectionCount = companyId ? await prisma.inspection.count({ where: { property: { companyId } } }) : 0;
  const reportCount = companyId ? await prisma.report.count({ where: { inspection: { property: { companyId } } } }) : 0;

  return (
    <main>
      <DashboardInstallBanner />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">Dashboard</h1>
          <p className="text-sm text-slate mt-1">A quick look at your portfolio.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/properties/new" className="border border-line text-ink px-4 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors">
            + Add property
          </Link>
          <Link href="/dashboard/inspections/new" className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            + New inspection
          </Link>
        </div>
      </div>

      <section className="grid sm:grid-cols-3 gap-4 mt-8">
        <div className="bg-white border border-line rounded-xl p-6">
          <p className="text-sm text-slate">Properties</p>
          <p className="font-display font-700 text-3xl text-ink mt-2">{propertyCount}</p>
        </div>
        <div className="bg-white border border-line rounded-xl p-6">
          <p className="text-sm text-slate">Inspections</p>
          <p className="font-display font-700 text-3xl text-ink mt-2">{inspectionCount}</p>
        </div>
        <div className="bg-white border border-line rounded-xl p-6">
          <p className="text-sm text-slate">Reports sent</p>
          <p className="font-display font-700 text-3xl text-ink mt-2">{reportCount}</p>
        </div>
      </section>
    </main>
  );
}
