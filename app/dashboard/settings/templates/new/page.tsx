import Link from "next/link";
import { createTemplate } from "@/lib/actions/templates";

export default function NewTemplatePage() {
  return (
    <main className="max-w-lg">
      <Link href="/dashboard/settings/templates" className="text-sm text-slate hover:text-ink">
        ← Back to templates
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">New template</h1>

      <form action={createTemplate} className="mt-8 space-y-4">
        <div>
          <label className="text-sm text-slate">Template name</label>
          <input name="name" required placeholder="Mid-term: Room" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>

        <div>
          <label className="text-sm text-slate">Inspection type</label>
          <select name="inspectionType" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
            <option value="check-in">Check-in</option>
            <option value="check-out">Check-out</option>
            <option value="mid-term">Mid-term</option>
            <option value="hmo">HMO</option>
            <option value="legionella">Legionella</option>
            <option value="maintenance">Maintenance</option>
          </select>
        </div>

        <div>
          <label className="text-sm text-slate">Property type this applies to</label>
          <select name="propertyType" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
            <option value="">Any property type</option>
            <option value="studio">Studio</option>
            <option value="room">Room-only</option>
            <option value="flat">Flat / Apartment</option>
            <option value="house">House</option>
            <option value="hmo">HMO</option>
            <option value="commercial">Commercial</option>
          </select>
        </div>

        <button type="submit" className="bg-signal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
          Create template
        </button>
      </form>
    </main>
  );
}
