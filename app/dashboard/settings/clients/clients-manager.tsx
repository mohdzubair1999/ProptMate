"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { deleteClientContact, forgetRememberedAddress, saveClientContact } from "@/lib/actions/clientContacts";
import { filterOptions } from "@/lib/searchSelect";

type Client = { id: string; name: string; address: string | null; email: string | null; phone: string | null; properties: number };
type Recipient = { id: string; email: string; name: string | null; useCount: number };

const INPUT = "mt-1 w-full border border-line rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-signal";

// Controlled, on purpose (see AddTeamMemberForm): a failed save must not wipe what was typed
function ClientForm({ initial, onDone }: { initial?: Client; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(saveClientContact, {});
  const [f, setF] = useState({ name: initial?.name ?? "", address: initial?.address ?? "", email: initial?.email ?? "", phone: initial?.phone ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((v) => ({ ...v, [k]: e.target.value }));
  useEffect(() => { if (state?.saved) onDone(); }, [state, onDone]);
  return (
    <form action={formAction} className="space-y-3" data-testid={initial ? "edit-client-form" : "add-client-form"}>
      {initial && <input type="hidden" name="clientId" value={initial.id} />}
      <div><label className="text-sm text-slate">Name</label><input name="name" required value={f.name} onChange={set("name")} className={INPUT} /></div>
      <div><label className="text-sm text-slate">Address</label><textarea name="address" rows={3} value={f.address} onChange={set("address")} className={INPUT} /></div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div><label className="text-sm text-slate">Email</label><input name="email" type="email" value={f.email} onChange={set("email")} className={INPUT} /></div>
        <div><label className="text-sm text-slate">Phone</label><input name="phone" value={f.phone} onChange={set("phone")} className={INPUT} /></div>
      </div>
      {state?.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2" data-testid="client-error">{state.error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 disabled:opacity-50">{pending ? "Saving…" : initial ? "Save changes" : "Save client"}</button>
        <button type="button" onClick={onDone} className="px-4 py-2 rounded-full text-sm border border-line text-slate hover:border-ink">Cancel</button>
      </div>
    </form>
  );
}

export default function ClientsManager({ clients, recipients, canRemove }: { clients: Client[]; recipients: Recipient[]; canRemove: boolean }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const byId = new Map(clients.map((c) => [c.id, c]));
    return filterOptions(clients.map((c) => ({ value: c.id, label: c.name, hint: c.email ?? "", keywords: [c.address ?? "", c.phone ?? ""] })), q, 500).shown.map((o) => byId.get(o.value)!);
  }, [clients, q]);

  return (
    <>
      <div className="mt-6 flex items-center gap-3 flex-wrap">
        {clients.length > 0 && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients…" aria-label="Search clients" data-testid="client-search" className="flex-1 min-w-[200px] border border-line rounded-lg px-3 py-2 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-signal" />}
        {!adding && <button type="button" onClick={() => { setAdding(true); setEditing(null); }} className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90" data-testid="add-client">Add a client</button>}
      </div>
      {adding && <div className="mt-4 bg-white border border-line rounded-xl p-5"><ClientForm onDone={() => setAdding(false)} /></div>}

      <div className="mt-4 bg-white border border-line rounded-xl overflow-hidden" data-testid="client-list">
        {clients.length === 0 ? (
          <p className="p-6 text-sm text-slate">No clients saved yet. Add one and it can be chosen on a property.</p>
        ) : shown.length === 0 ? (
          <p className="p-6 text-sm text-slate" data-testid="no-client-match">No client matches “{q.trim()}”.</p>
        ) : (
          shown.map((c) => (
            <div key={c.id} className="p-4 border-b border-line last:border-b-0" data-testid="client-row">
              {editing === c.id ? (
                <ClientForm initial={c} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-ink">{c.name}</p>
                    {c.address && <p className="text-slate whitespace-pre-line">{c.address}</p>}
                    <p className="text-slate">{[c.email, c.phone].filter(Boolean).join(" · ")}</p>
                    <p className="text-xs text-slate mt-1">{c.properties === 0 ? "Not chosen on any property yet" : `Used by ${c.properties} propert${c.properties === 1 ? "y" : "ies"}`}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button type="button" onClick={() => { setEditing(c.id); setAdding(false); }} className="text-sm text-signal hover:underline">Edit</button>
                    {canRemove && (
                      <form action={deleteClientContact} onSubmit={(e) => { if (!window.confirm(`Delete ${c.name}? Properties that use it keep the name and address already on them.`)) e.preventDefault(); }}>
                        <input type="hidden" name="clientId" value={c.id} />
                        <button type="submit" className="text-sm text-slate hover:text-red-600">Delete</button>
                      </form>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <h2 className="font-display font-600 text-lg text-ink mt-10">Remembered email addresses</h2>
      <p className="text-sm text-slate mt-1">Addresses you have sent reports to are remembered so they can be suggested when you type a few letters. {canRemove ? "Remove any you no longer want kept." : "An Admin or Manager can remove them."}</p>
      <div className="mt-3 bg-white border border-line rounded-xl overflow-hidden" data-testid="recipient-list">
        {recipients.length === 0 ? (
          <p className="p-5 text-sm text-slate">None yet. Addresses appear here after you send a report.</p>
        ) : (
          recipients.map((r) => (
            <div key={r.id} className="px-4 py-2.5 border-b border-line last:border-b-0 flex items-center justify-between gap-3 text-sm" data-testid="recipient-row">
              <span className="min-w-0 truncate text-ink">{r.email}{r.name ? <span className="text-slate"> · {r.name}</span> : null}<span className="text-xs text-slate"> · sent {r.useCount} time{r.useCount === 1 ? "" : "s"}</span></span>
              {canRemove && (
                <form action={forgetRememberedAddress}>
                  <input type="hidden" name="recipientId" value={r.id} />
                  <button type="submit" className="text-slate hover:text-red-600 shrink-0">Remove</button>
                </form>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
