import { addComplianceDocument } from "@/lib/actions/compliance";
import DocumentDateFields from "../properties/[id]/document-date-fields";

export default function AddComplianceDocumentForm({ properties }: { properties: { id: string; address: string }[] }) {
  return (
    <form action={addComplianceDocument} className="mt-4 grid grid-cols-2 gap-3 max-w-lg">
      <div className="col-span-2">
        <label className="text-sm text-slate">Property</label>
        <select name="propertyId" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
          <option value="">Select a property</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address}
            </option>
          ))}
        </select>
      </div>

      <DocumentDateFields />

      <div className="col-span-2">
        <label className="text-sm text-slate">If "Other", what is it? (optional)</label>
        <input name="otherTypeLabel" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div className="col-span-2">
        <label className="text-sm text-slate">Notes (optional)</label>
        <input name="notes" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <button type="submit" className="col-span-2 bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity w-fit">
        Add document
      </button>
    </form>
  );
}
