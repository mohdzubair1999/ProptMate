import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ExpireOldLinks from "./expire-old-links";
import SearchFilterBar from "@/components/SearchFilterBar";
import { propertySearchFilter } from "@/lib/propertySearch";

const PAGE = 100; // how many properties are listed at once: search to find any other

export default async function FloorPlansPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const companyId = (session.user as any).companyId as string | null;

  // the same four things the Properties page searches: address, city, postcode and landlord
  const where = { companyId: companyId ?? "", ...propertySearchFilter(q) };
  const [properties, matching, everyProperty] = companyId
    ? await Promise.all([
        prisma.property.findMany({ where, select: { id: true, address: true, floorPlan: { select: { id: true } } }, orderBy: { address: "asc" }, take: PAGE }),
        prisma.property.count({ where }),
        prisma.property.count({ where: { companyId } }),
      ])
    : [[], 0, 0];

  // links that never expire (made before expiry existed): only Admins and Managers are asked about them
  const role = (session.user as any).role as string | undefined;
  const oldLinks = companyId && (role === "ADMIN" || role === "MANAGER") ? await prisma.floorPlan.count({ where: { property: { companyId }, shareToken: { not: null }, shareExpiresAt: null } }) : 0;

  return (
    <main>
      <h1 className="font-display font-700 text-2xl text-ink">Floor Plans</h1>
      <p className="text-sm text-slate mt-1">A simple, auto-generated layout for each property — kept separate from inspections and reports.</p>

      {oldLinks > 0 && <ExpireOldLinks count={oldLinks} />}

      {everyProperty > 0 && <SearchFilterBar searchPlaceholder="Search by address, postcode or landlord…" filters={[]} />}

      {everyProperty === 0 ? (
        <div className="mt-8 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No properties yet — add one first, then come back here to create its floor plan.</p>
        </div>
      ) : properties.length === 0 ? (
        <div className="mt-6 bg-white border border-line rounded-xl p-10 text-center" data-testid="no-matching-properties">
          <p className="text-slate text-sm">No properties match “{q}”. Try part of the address or the postcode.</p>
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
      {matching > properties.length && (
        <p className="mt-3 text-xs text-slate" data-testid="floor-plans-limit">Showing the first {properties.length} of {matching} properties. Use the search box above to find another.</p>
      )}
    </main>
  );
}
