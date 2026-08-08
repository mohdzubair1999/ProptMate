import Link from "next/link";
import { createProperty } from "@/lib/actions/properties";

export default function NewPropertyPage() {
  return (
    <main className="max-w-lg">
      <Link href="/dashboard/properties" className="text-sm text-slate hover:text-ink">
        ← Back to properties
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Add property</h1>

      <form action={createProperty} className="mt-8 space-y-4">
        <div>
          <label className="text-sm text-slate">Address</label>
          <input name="address" required placeholder="12 Baker Street" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate">City / Town</label>
            <input name="city" placeholder="London" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Postcode</label>
            <input name="postcode" placeholder="NW1 6XE" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate">Type</label>
            <select name="type" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
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
            <input name="bedrooms" type="number" min="0" placeholder="2" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
        </div>
        <div>
          <label className="text-sm text-slate">Landlord name (optional)</label>
          <input name="landlordName" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <div>
          <label className="text-sm text-slate">Notes (optional)</label>
          <textarea name="notes" rows={3} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <button type="submit" className="bg-signal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
          Save property
        </button>
      </form>
    </main>
  );
}
