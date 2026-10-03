"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createInspection } from "@/lib/actions/inspections";

type Property = { id: string; address: string };
type Template = { id: string; name: string; propertyType: string | null };

export default function NewInspectionForm({ properties, templates, initialPropertyId }: { properties: Property[]; templates: Template[]; initialPropertyId: string }) {
  const [state, formAction, pending] = useActionState(createInspection, {});
  // Controlled, deliberately - see AddTeamMemberForm/NewPropertyForm: otherwise a failed
  // submission would reset the property/type/template the user had already picked.
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [type, setType] = useState("check-in");
  const [templateId, setTemplateId] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");

  // React 19 resets a <select>'s DOM value to its native default (its first option) after every
  // action submission - success or failure - even when the select is controlled; a plain text
  // input doesn't have this problem, only select does. Re-assert the real value once the
  // submission settles, so a failed submit doesn't silently swap the property back to whichever
  // one happens to be first in the list.
  const propertyRef = useRef<HTMLSelectElement>(null);
  const typeRef = useRef<HTMLSelectElement>(null);
  const templateRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (pending) return;
    if (propertyRef.current && propertyRef.current.value !== propertyId) propertyRef.current.value = propertyId;
    if (typeRef.current && typeRef.current.value !== type) typeRef.current.value = type;
    if (templateRef.current && templateRef.current.value !== templateId) templateRef.current.value = templateId;
  }, [pending, propertyId, type, templateId]);

  return (
    <form action={formAction} className="mt-8 space-y-4">
      <div>
        <label className="text-sm text-slate">Property</label>
        <select
          ref={propertyRef}
          name="propertyId"
          required
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="" disabled>
            Select a property
          </option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm text-slate">Type</label>
        <select ref={typeRef} name="type" value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
          <option value="check-in">Check-in</option>
          <option value="check-out">Check-out</option>
          <option value="mid-term">Mid-term</option>
          <option value="hmo">HMO</option>
          <option value="legionella">Legionella</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      <div>
        <label className="text-sm text-slate">Template (optional)</label>
        <select
          ref={templateRef}
          name="templateId"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">No template — freeform rooms &amp; items</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} {t.propertyType ? `(${t.propertyType})` : ""}
            </option>
          ))}
        </select>
        {templates.length === 0 && (
          <p className="text-xs text-slate mt-1">
            No templates yet —{" "}
            <a href="/dashboard/settings/templates/new" className="underline">
              build one
            </a>{" "}
            to use structured sections instead.
          </p>
        )}
      </div>

      <div>
        <label className="text-sm text-slate">Scheduled date (optional)</label>
        <input
          name="scheduledDate"
          type="date"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>

      {state?.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>}
      <button type="submit" disabled={pending} className="bg-signal text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
        {pending ? "Creating…" : "Create inspection"}
      </button>
    </form>
  );
}
