"use client";

import { useState } from "react";

// A generic modal wrapper — triggered by a button, opens its children in a proper full
// overlay rather than a small dropdown panel. Used for content too substantial for a corner
// panel (a multi-step review flow, a long form), where wrapping from the outside like this
// means the wrapped component's own internals never need touching.
export default function MenuModal({
  label,
  icon,
  title,
  children,
}: {
  label: string;
  icon?: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-full border border-line text-ink hover:border-ink transition-colors flex items-center gap-1.5"
      >
        {icon} {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="relative bg-white border border-line rounded-xl shadow-lg w-full max-w-2xl my-8">
            <div className="flex items-center justify-between px-5 py-3 border-b border-line">
              <p className="font-display font-600 text-ink">{title}</p>
              <button type="button" onClick={() => setOpen(false)} className="text-slate hover:text-ink text-lg leading-none">
                ✕
              </button>
            </div>
            <div className="p-5">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
