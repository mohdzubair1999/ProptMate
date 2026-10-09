"use client";

import { useActionState, useState } from "react";
import { confirmReceipt } from "@/lib/actions/acknowledgements";
import PublicSignatureCanvas from "./public-signature-canvas";

export default function ConfirmForm({ token, defaultName }: { token: string; defaultName: string }) {
  const [state, formAction, pending] = useActionState(confirmReceipt, {});
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  if (state?.success) {
    return (
      <div className="bg-verified/10 border border-verified/30 rounded-xl p-6 text-center">
        <p className="text-verified font-medium">✓ Thanks — your confirmation has been recorded.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white border border-line rounded-xl p-5 space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="signatureDataUrl" value={signatureDataUrl || ""} />

      <div>
        <label className="text-sm text-slate">Your name</label>
        <input
          name="confirmedName"
          required
          defaultValue={defaultName}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>

      <div>
        <label className="text-sm text-slate">Signature</label>
        <div className="mt-1">
          <PublicSignatureCanvas onChange={setSignatureDataUrl} />
        </div>
      </div>

      {state?.error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{state.error}</p>}

      <button
        type="submit"
        disabled={pending || !signatureDataUrl}
        className="w-full bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pending ? "Confirming…" : "Confirm I received this report"}
      </button>
    </form>
  );
}
