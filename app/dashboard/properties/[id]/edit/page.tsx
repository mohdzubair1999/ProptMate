import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateProperty } from "@/lib/actions/properties";
import FrequencySelector from "./frequency-selector";

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await prisma.property.findUnique({ where: { id: id } });
  if (!property) notFound();

  return (
    <main className="max-w-lg">
      <Link href={`/dashboard/properties/${property.id}`} className="text-sm text-slate hover:text-ink">
        ← Back to property
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Edit property</h1>

      <form action={updateProperty} className="mt-8 space-y-4">
        <input type="hidden" name="propertyId" value={property.id} />
        <div>
          <label className="text-sm text-slate">Address</label>
          <input name="address" required defaultValue={property.address} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate">City / Town</label>
            <input name="city" defaultValue={property.city || ""} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Postcode</label>
            <input name="postcode" defaultValue={property.postcode || ""} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate">Type</label>
            <select name="type" defaultValue={property.type} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
              <option value="flat">Flat / Apartment</option>
              <option value="house">House</option>
              <option value="studio">Studio</option>
              <option value="room">Room</option>
              <option value="hmo">HMO</option>
              <option value="commercial">Commercial</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate">Bedrooms (optional)</label>
            <input name="bedrooms" type="number" min="0" defaultValue={property.bedrooms ?? ""} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
        </div>
        <FrequencySelector initialValue={property.inspectionFrequencyMonths} />
        <div>
          <label className="text-sm text-slate">Notes (optional)</label>
          <textarea name="notes" rows={3} defaultValue={property.notes || ""} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <button type="submit" className="bg-signal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
          Save changes
        </button>
      </form>
    </main>
  );
}
