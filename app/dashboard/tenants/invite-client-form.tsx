"use client";

import { useActionState, useRef, useEffect, useState } from "react";
import { formatDate } from "@/lib/formatDate";
import { inviteClient } from "@/lib/actions/portal";

type ReportOption = { id: string; type: string; propertyId: string; completedDate: Date | null };

export default function InviteClientForm({ properties, reports }: { properties: { id: string; address: string }[]; reports: ReportOption[] }) {
  const [state, formAction, pending] = useActionState(inviteClient, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");

  // Clear the form back to blank once an invite genuinely succeeds - otherwise it would keep
  // showing the just-submitted values, which looks like it could still be re-submitted as-is.
  useEffect(() => {
    if (state && !state.error && !pending) {
      formRef.current?.reset();
      setSelectedPropertyId("");
    }
  }, [state, pending]);

  const availableReports = reports.filter((r) => r.propertyId === selectedPropertyId);

  return (
    <form ref={formRef} action={formAction} className="mt-4 grid grid-cols-2 gap-3 max-w-lg">
      <div className="col-span-2">
        <label className="text-sm text-slate">Property</label>
        <select
          name="propertyId"
          required
          value={selectedPropertyId}
          onChange={(e) => setSelectedPropertyId(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">Select a property</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm text-slate">Name</label>
        <input name="name" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Email</label>
        <input name="email" type="email" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Relationship</label>
        <select name="relation" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
          <option value="TENANT">Tenant</option>
          <option value="LANDLORD">Landlord</option>
        </select>
      </div>
      <div>
        <label className="text-sm text-slate">Password (optional)</label>
        <input name="password" type="password" minLength={8} placeholder="Leave blank if not needed" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <p className="col-span-2 text-xs text-slate">Only set a password if this person will actually log in to the portal themselves — most tenants and landlords won't need to.</p>

      {selectedPropertyId && (
        <div className="col-span-2">
          <label className="text-sm text-slate">Reports to share with them (optional)</label>
          {availableReports.length === 0 ? (
            <p className="text-xs text-slate mt-1">No generated reports yet for this property.</p>
          ) : (
            <div className="mt-1 space-y-1">
              {availableReports.map((r) => (
                <label key={r.id} className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="reportInspectionIds" value={r.id} className="rounded border-line" />
                  <span className="capitalize">{r.type.replace("-", " ")}</span>
                  <span className="text-xs text-slate">{r.completedDate ? formatDate(r.completedDate) : ""}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {state?.error && (
        <p className="col-span-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="col-span-2 bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 w-fit"
      >
        {pending ? "Inviting…" : "Invite"}
      </button>
    </form>
  );
}
