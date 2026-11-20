"use client";
import { useActionState } from "react";
import { savePriceItem } from "@/lib/actions/priceList";

export default function PriceForm() {
  const [state, action, pending] = useActionState(savePriceItem, undefined);
  const input = "w-full border border-line rounded-lg px-3 py-2 text-sm";
  return (
    <form action={action} className="mt-6 bg-white border border-line rounded-xl p-5 grid sm:grid-cols-2 gap-3">
      <h2 className="sm:col-span-2 font-display font-600 text-ink">Add a price</h2>
      <div><label className="block text-xs text-slate mb-1">Name</label><input name="name" required maxLength={120} className={input} placeholder="Repaint a wall" /></div>
      <div><label className="block text-xs text-slate mb-1">Price (£)</label><input name="price" required inputMode="decimal" className={input} placeholder="90" /></div>
      <div><label className="block text-xs text-slate mb-1">Matches these words</label><input name="keywords" maxLength={300} className={input} placeholder="wall, paint, scuff" /></div>
      <div><label className="block text-xs text-slate mb-1">Lifespan in years (optional)</label><input name="lifespan" inputMode="numeric" className={input} placeholder="5" /></div>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button disabled={pending} className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium disabled:opacity-50">{pending ? "Saving…" : "Add to price list"}</button>
        {state?.error && <span className="text-sm text-red-600" role="alert">{state.error}</span>}
        {state?.saved && <span className="text-sm text-verified">Added.</span>}
      </div>
    </form>
  );
}
