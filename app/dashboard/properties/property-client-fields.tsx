"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SearchableSelect from "@/components/SearchableSelect";

type ClientOpt = { id: string; name: string; address: string | null };

// The client of a property: choose a saved client (its name and address are filled in and kept in step with it) or type them in. The saved-client box only appears
// when the company has saved clients. These are controlled fields, so a failed save keeps what was typed.
export default function PropertyClientFields({ clients, initial }: { clients: ClientOpt[]; initial?: { clientContactId?: string | null; landlordName?: string | null; landlordAddress?: string | null } }) {
  const [clientId, setClientId] = useState(initial?.clientContactId ?? "");
  const [name, setName] = useState(initial?.landlordName ?? "");
  const [address, setAddress] = useState(initial?.landlordAddress ?? "");
  const options = useMemo(() => clients.map((c) => ({ value: c.id, label: c.name, hint: c.address ? c.address.split("\n")[0] : undefined })), [clients]);
  const chosen = clients.find((c) => c.id === clientId);
  const BOX = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-signal read-only:bg-paper read-only:text-slate";
  return (
    <>
      {clients.length > 0 && (
        <div>
          <label className="text-sm text-slate">Saved client (optional)</label>
          <div className="mt-1">
            <SearchableSelect
              name="clientContactId"
              value={clientId}
              onChange={(id) => { setClientId(id); const c = clients.find((x) => x.id === id); if (c) { setName(c.name); setAddress(c.address ?? ""); } }}
              options={options}
              emptyLabel="No saved client — type the details below"
              id="property-client"
              ariaLabel="Saved client"
              placeholder="Search saved clients…"
              noun="client"
            />
          </div>
          <p className="text-xs text-slate mt-1">Every new inspection of this property then fills in the summary&apos;s client name and address. Manage clients in <Link href="/dashboard/settings/clients" className="text-signal hover:underline">Settings, Client details</Link>.</p>
        </div>
      )}
      <div>
        <label className="text-sm text-slate">Client name (optional)</label>
        <input name="landlordName" value={name} readOnly={!!chosen} onChange={(e) => setName(e.target.value)} className={BOX} />
      </div>
      <div>
        <label className="text-sm text-slate">Client address (optional)</label>
        <textarea name="landlordAddress" rows={2} value={address} readOnly={!!chosen} onChange={(e) => setAddress(e.target.value)} className={BOX} />
        {chosen && <p className="text-xs text-slate mt-1">These come from the saved client. Change them in Settings, Client details, or choose “No saved client” to type your own.</p>}
      </div>
    </>
  );
}
