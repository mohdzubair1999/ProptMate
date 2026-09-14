import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";
import { CONDITION_LABELS, CONDITION_STYLES } from "@/lib/inventoryConditions";

export default async function ItemTimelinePage({ params }: { params: Promise<{ id: string; room: string; itemName: string }> }) {
  const { id, room, itemName } = await params;
  const decodedRoom = decodeURIComponent(room);
  const decodedItemName = decodeURIComponent(itemName);

  const property = await prisma.property.findUnique({ where: { id }, select: { id: true, address: true } });
  if (!property) notFound();

  // Same room+itemName matching as the check-in comparison feature - exact, trimmed,
  // case-insensitive, deliberately never fuzzy, since a wrong match here would silently show
  // someone the wrong item's history next to the right one.
  const items = await prisma.inspectionItem.findMany({
    where: {
      inspection: { propertyId: id, deletedAt: null },
      room: { equals: decodedRoom, mode: "insensitive" },
      itemName: { equals: decodedItemName, mode: "insensitive" },
    },
    include: {
      inspection: { select: { id: true, type: true, completedDate: true, createdAt: true } },
      photos: { select: { id: true, url: true } },
    },
  });

  if (items.length === 0) notFound();

  const sorted = items.sort((a, b) => {
    const dateA = (a.inspection.completedDate || a.inspection.createdAt).getTime();
    const dateB = (b.inspection.completedDate || b.inspection.createdAt).getTime();
    return dateA - dateB;
  });

  return (
    <main>
      <Link href={`/dashboard/properties/${property.id}/timeline`} className="text-sm text-slate hover:text-ink">
        ← Back to timeline
      </Link>

      <div className="mt-4">
        <h1 className="font-display font-700 text-2xl text-ink">{decodedItemName}</h1>
        <p className="text-sm text-slate mt-1">
          {decodedRoom} at {property.address}
        </p>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => {
          const stageDate = item.inspection.completedDate || item.inspection.createdAt;
          return (
            <div key={item.id} className="bg-white border border-line rounded-xl p-4">
              <p className="text-xs font-medium text-slate uppercase tracking-wide">{inspectionTypeDisplayName(item.inspection.type)}</p>
              <p className="text-xs text-slate mt-0.5">{formatDate(stageDate)}</p>

              <span className={`inline-block mt-2 text-xs px-2 py-1 rounded-full font-medium ${CONDITION_STYLES[item.condition] || "bg-line/40 text-slate"}`}>
                {CONDITION_LABELS[item.condition] || item.condition}
              </span>

              {item.notes && <p className="text-sm text-ink mt-3">{item.notes}</p>}

              {item.photos.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {item.photos.map((photo) => (
                    <img key={photo.id} src={photo.url} alt="" className="rounded-lg aspect-square object-cover" />
                  ))}
                </div>
              )}

              {!item.notes && item.photos.length === 0 && <p className="text-xs text-slate mt-3 italic">No notes or photos recorded at this stage.</p>}
            </div>
          );
        })}
      </div>
    </main>
  );
}
