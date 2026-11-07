"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createProperty } from "@/lib/actions/properties";

const BLANK = { address: "", city: "", postcode: "", bedrooms: "", type: "flat", landlordName: "", landlordAddress: "", notes: "" };

export default function NewPropertyForm() {
  const [state, formAction, pending] = useActionState(createProperty, {});
  // Controlled, deliberately - see AddTeamMemberForm for why: an uncontrolled field gets wiped
  // by React itself after a failed submission, and a property's address and notes are exactly
  // the kind of thing nobody wants to have to retype.
  const [fields, setFields] = useState(BLANK);
  const set = (key: keyof typeof BLANK) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));

  // React 19 resets a <select>'s DOM value to its native default (its first option) after every
  // action submission, even when controlled - unlike a plain text input, which survives fine on
  // its own. Re-assert the real value once the submission settles.
  const typeRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!pending && typeRef.current && typeRef.current.value !== fields.type) typeRef.current.value = fields.type;
  }, [pending, fields.type]);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label className="text-sm text-slate">Address</label>
        <input name="address" required placeholder="12 Baker Street" value={fields.address} onChange={set("address")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-slate">City / Town</label>
          <input name="city" placeholder="London" value={fields.city} onChange={set("city")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <div>
          <label className="text-sm text-slate">Postcode</label>
          <input name="postcode" placeholder="NW1 6XE" value={fields.postcode} onChange={set("postcode")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm text-slate">Type</label>
          <select name="type" value={fields.type} onChange={set("type")} ref={typeRef} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
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
          <input name="bedrooms" type="number" min="0" placeholder="2" value={fields.bedrooms} onChange={set("bedrooms")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
      </div>
      <div>
        <label className="text-sm text-slate">Client name (optional)</label>
        <input name="landlordName" value={fields.landlordName} onChange={set("landlordName")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Client address (optional)</label>
        <input name="landlordAddress" value={fields.landlordAddress} onChange={set("landlordAddress")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Notes (optional)</label>
        <textarea name="notes" rows={3} value={fields.notes} onChange={set("notes")} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      {state?.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>}
      <button type="submit" disabled={pending} className="bg-signal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
        {pending ? "Saving…" : "Save property"}
      </button>
    </form>
  );
}
