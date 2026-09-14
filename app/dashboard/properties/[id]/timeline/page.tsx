import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PropertyTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const property = await prisma.property.findUnique({ where: { id }, select: { id: true, address: true } });
  if (!property) notFound();

  const items = await prisma.inspectionItem.findMany({
    where: { inspection: { propertyId: id, deletedAt: null } },
    select: { room: true, itemName: true, inspectionId: true },
  });

  // Groups by normalized room+itemName, counting how many DISTINCT inspections each appears
  // in (not how many item rows - a room could in principle have duplicate rows within one
  // inspection, which shouldn't inflate the count of genuinely different stages).
  const grouped = new Map<string, { room: string; itemName: string; inspectionIds: Set<string> }>();
  for (const item of items) {
    const key = `${item.room.trim().toLowerCase()}|||${item.itemName.trim().toLowerCase()}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.inspectionIds.add(item.inspectionId);
    } else {
      grouped.set(key, { room: item.room, itemName: item.itemName, inspectionIds: new Set([item.inspectionId]) });
    }
  }

  const timelineItems = [...grouped.values()]
    .filter((g) => g.inspectionIds.size >= 2)
    .sort((a, b) => b.inspectionIds.size - a.inspectionIds.size || a.room.localeCompare(b.room));

  return (
    <main>
      <Link href={`/dashboard/properties/${property.id}`} className="text-sm text-slate hover:text-ink">
        ← Back to property
      </Link>

      <div className="mt-4">
        <h1 className="font-display font-700 text-2xl text-ink">Condition timeline</h1>
        <p className="text-sm text-slate mt-1">{property.address} — how each item's condition has changed across inspections.</p>
      </div>

      {timelineItems.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No item has appeared across more than one inspection yet for this property.</p>
        </section>
      ) : (
        <div className="mt-6 space-y-2">
          {timelineItems.map((g) => (
            <Link
              key={`${g.room}|||${g.itemName}`}
              href={`/dashboard/properties/${property.id}/timeline/${encodeURIComponent(g.room)}/${encodeURIComponent(g.itemName)}`}
              className="block bg-white border border-line rounded-xl p-4 hover:border-ink transition-colors"
            >
              <p className="text-ink font-medium">{g.itemName}</p>
              <p className="text-sm text-slate mt-0.5">
                {g.room} · seen across {g.inspectionIds.size} inspections
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
