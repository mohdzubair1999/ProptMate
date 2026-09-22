import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import RemovePageBreaksButton from "./remove-page-breaks-button";

export default async function TemplatesPage() {
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;
  const role = (session?.user as any)?.role as string | undefined;
  const canManage = role === "ADMIN" || role === "MANAGER";

  const templates = companyId
    ? await prisma.template.findMany({
        where: { companyId },
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { sections: true, inspections: true } } },
      })
    : [];

  return (
    <main>
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>

      <div className="flex items-center justify-between mt-4 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">Report templates</h1>
          <p className="text-sm text-slate mt-1">{templates.length} total</p>
        </div>
        {canManage && (
          <Link href="/dashboard/settings/templates/new" className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            New template
          </Link>
        )}
      </div>

      {canManage && <RemovePageBreaksButton />}

      {templates.length === 0 ? (
        <section className="mt-10 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No templates yet. Build one to define what an inspector sees for a given property type.</p>
        </section>
      ) : (
        <div className="mt-8 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Inspection type</th>
                <th className="px-6 py-3 font-medium">Property type</th>
                <th className="px-6 py-3 font-medium">Sections</th>
                <th className="px-6 py-3 font-medium">Used by</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-paper transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/settings/templates/${t.id}`} className="text-ink font-medium hover:text-signal">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate capitalize">{t.inspectionType}</td>
                  <td className="px-6 py-4 text-slate capitalize">{t.propertyType || "Any"}</td>
                  <td className="px-6 py-4 text-slate">{t._count.sections}</td>
                  <td className="px-6 py-4 text-slate">{t._count.inspections} inspections</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </main>
  );
}
