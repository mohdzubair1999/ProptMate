"use client";

import { useActionState } from "react";
import { updateClientProfile } from "@/lib/actions/portal";

export default function EditClientProfileForm({ userId, propertyId, initialName, initialEmail }: { userId: string; propertyId: string; initialName: string; initialEmail: string }) {
  const [state, formAction, pending] = useActionState(updateClientProfile, {});

  return (
    <>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="propertyId" value={propertyId} />
        <div>
          <label className="text-xs text-slate">Name</label>
          <input name="name" required defaultValue={initialName} className="mt-1 block border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <div>
          <label className="text-xs text-slate">Email</label>
          <input name="email" type="email" required defaultValue={initialEmail} className="mt-1 block border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="bg-ink text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-signal transition-colors disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      {state?.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
      <p className="text-xs text-slate mt-1">Changing the email changes what they log in with.</p>
    </>
  );
}
