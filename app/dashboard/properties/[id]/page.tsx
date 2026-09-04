import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import { deleteProperty } from "@/lib/actions/properties";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id: id },
    include: {
      inspections: { orderBy: { createdAt: "desc" }, include: { inspector: true } },
    },
  });

  if (!property) notFound();

  return (
    <main>
      <Link href="/dashboard/properties" className="text-sm text-slate hover:text-ink">
        ← Back to properties
      </Link>

      <div className="flex items-start justify-between mt-4 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">{property.address}</h1>
          {(property.city || property.postcode) && (
            <p className="text-sm text-slate mt-0.5">{[property.city, property.postcode].filter(Boolean).join(", ")}</p>
          )}
          <p className="text-sm text-slate mt-1 capitalize">
            {property.type}
            {property.bedrooms != null && ` · ${property.bedrooms} bed${property.bedrooms === 1 ? "" : "s"}`}
            {property.landlordName && ` · Client: ${property.landlordName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/properties/${property.id}/edit`} className="border border-line text-ink px-4 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors">
            Edit
          </Link>
          <Link href={`/dashboard/inspections/new?propertyId=${property.id}`} className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            New inspection
          </Link>
        </div>
      </div>

      <form action={deleteProperty} className="mt-4">
        <input type="hidden" name="propertyId" value={property.id} />
        <ConfirmSubmitButton
          confirmMessage={`Permanently delete "${property.address}" and all ${property.inspections.length} inspection(s) under it? This cannot be undone.`}
          className="text-xs text-red-600 hover:text-red-700 underline"
        >
          Delete this property
        </ConfirmSubmitButton>
      </form>

      {property.notes && <p className="mt-4 text-sm text-slate bg-white border border-line rounded-xl p-4">{property.notes}</p>}

      <p className="text-xs text-slate mt-6">
        Tenants, landlords, and compliance documents for this property are now managed from{" "}
        <Link href="/dashboard/tenants" className="text-signal hover:underline">
          Tenants &amp; Landlords
        </Link>{" "}
        and{" "}
        <Link href="/dashboard/compliance" className="text-signal hover:underline">
          Compliance
        </Link>{" "}
        in the sidebar.
      </p>

      <h2 className="font-display font-600 text-lg text-ink mt-10">Inspections</h2>

      {property.inspections.length === 0 ? (
        <p className="text-sm text-slate mt-3">No inspections yet for this property.</p>
      ) : (
        <div className="mt-4 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate">
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Inspector</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {property.inspections.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-6 py-4 capitalize">
                    <Link href={`/dashboard/inspections/${i.id}`} className="text-ink hover:text-signal">
                      {i.type}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate">{i.inspector.name || i.inspector.email}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${i.status === "completed" ? "bg-verified/10 text-verified" : "bg-signal/10 text-signal"}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate">{i.scheduledDate ? formatDate(i.scheduledDate) : "—"}</td>
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
