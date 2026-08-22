"use client";

import { useActionState } from "react";
import { sendContactMessage } from "@/lib/actions/contact";

const initialState: { error?: string; success?: boolean } = {};

export default function ContactForm() {
  const [state, formAction, pending] = useActionState(async (_prev: typeof initialState, formData: FormData) => {
    return await sendContactMessage(formData);
  }, initialState);

  if (state.success) {
    return (
      <div className="bg-white border border-line rounded-xl p-8 text-center">
        <p className="text-verified font-medium">✓ Message sent — we'll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="bg-white border border-line rounded-xl p-8 space-y-4">
      <div>
        <label className="text-sm text-slate">Name</label>
        <input name="name" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Email</label>
        <input name="email" type="email" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-sm text-slate">Message</label>
        <textarea name="message" required rows={5} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="bg-signal text-white px-6 py-2.5 rounded-full font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
