import { addComplianceDocument } from "@/lib/actions/compliance";
import DocumentDateFields from "../properties/[id]/document-date-fields";
import SearchableSelect from "@/components/SearchableSelect";
import { propertyOptions, type PickerProperty } from "@/lib/propertyPicker";

export default function AddComplianceDocumentForm({ properties }: { properties: PickerProperty[] }) {
  return (
    <form action={addComplianceDocument} className="mt-4 grid grid-cols-2 gap-3 max-w-lg">
      <div className="col-span-2">
        <label className="text-sm text-slate">Property</label>
        <div className="mt-1">
          <SearchableSelect name="propertyId" required options={propertyOptions(properties)} id="compliance-property" ariaLabel="Property" placeholder="Search by address, postcode or landlord…" noun="property" nounPlural="properties" />
        </div>
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
