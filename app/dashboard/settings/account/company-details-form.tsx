"use client";

import { useActionState, useEffect, useState } from "react";
import { updateCompanyDetails } from "@/lib/actions/company";

export default function CompanyDetailsForm({ initialName, initialWebsite }: { initialName: string; initialWebsite: string }) {
  const [state, formAction, pending] = useActionState(updateCompanyDetails, {});
  // Controlled, so a rejected save (a bad website, not an Admin) doesn't wipe what was just typed.
  const [name, setName] = useState(initialName);
  const [website, setWebsite] = useState(initialWebsite);

  // Show the tidied version that was actually saved (extra spaces collapsed, https:// added).
  useEffect(() => {
    if (state?.saved) {
      setName(state.saved.name);
      setWebsite(state.saved.website ?? "");
    }
  }, [state]);

  const justSaved = !!state?.saved && !state.error && name === state.saved.name && website === (state.saved.website ?? "");
  const input = "mt-1 w-full max-w-sm border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal";

  return (
    <section className="bg-white border border-line rounded-xl p-6">
      <h2 className="font-display font-600 text-lg text-ink">Company details</h2>
      <p className="text-sm text-slate mt-1">
        Shown in the header of every page of your reports, after the cover. Clicking the name in a report opens your website. Only an Admin can change these.
      </p>
      <form action={formAction} className="mt-4 space-y-4">
        <div>
          <label className="text-sm text-slate">Company name</label>
          <input name="name" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={input} />
        </div>
        <div>
          <label className="text-sm text-slate">Website (optional)</label>
          <input name="website" inputMode="url" placeholder="https://yourcompany.com" maxLength={200} value={website} onChange={(e) => setWebsite(e.target.value)} className={input} />
          <p className="text-xs text-slate mt-1">Leave blank and the company name in reports won&apos;t be a link.</p>
        </div>
        <button type="submit" disabled={pending} className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{state.error}</p>}
      {justSaved && state?.saved && (
        <p className="text-sm text-verified mt-3">
          Saved. New reports will show “{state.saved.name}”{state.saved.website ? `, linking to ${state.saved.website}` : ", with no link"}.
        </p>
      )}
    </section>
  );
}
