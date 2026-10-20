import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function FloorPlansPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const companyId = (session.user as any).companyId as string | null;

  const properties = companyId
    ? await prisma.property.findMany({
        where: { companyId },
        select: { id: true, address: true, floorPlan: { select: { id: true } } },
        orderBy: { address: "asc" },
      })
    : [];

  return (
    <main>
      <h1 className="font-display font-700 text-2xl text-ink">Floor Plans</h1>
      <p className="text-sm text-slate mt-1">A simple, auto-generated layout for each property — kept separate from inspections and reports.</p>

      {properties.length === 0 ? (
        <div className="mt-8 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No properties yet — add one first, then come back here to create its floor plan.</p>
        </div>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
          {properties.map((p) => (
            <Link
              key={p.id}
              href={`/dashboard/floor-plans/${p.id}`}
              className="flex items-center justify-between px-6 py-4 border-b border-line last:border-0 hover:bg-paper transition-colors"
            >
              <span className="text-sm text-ink">{p.address}</span>
              <span className="text-xs text-slate">{p.floorPlan ? "View / edit floor plan" : "Create floor plan"}</span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
