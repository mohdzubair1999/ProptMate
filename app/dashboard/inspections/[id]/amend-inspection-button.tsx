"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { amendInspection, type AmendState } from "@/lib/actions/inspections";

// "Amend inspection" on a completed inspection. It asks for a reason (kept in the audit log), says plainly what will
// happen - including when the report has already gone out, because copies already sent will not change - and only
// then takes the inspection back to draft so it can be corrected.
export default function AmendInspectionButton({
  inspectionId,
  sentCount,
  confirmedCount,
  hasReport,
}: {
  inspectionId: string;
  sentCount: number;
  confirmedCount: number;
  hasReport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<AmendState | undefined, FormData>(amendInspection, undefined);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  // Done: the page has refreshed as a draft, so the dialog has nothing more to say.
  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  useEffect(() => {
    if (!open) return;
    reasonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 rounded-full border border-line text-slate hover:text-ink hover:border-ink transition-colors"
      >
        ✎ Amend inspection
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
          onClick={() => !pending && setOpen(false)}
          data-testid="amend-overlay"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="amend-title"
            className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="amend-title" className="font-display font-700 text-lg text-ink">
              Amend this inspection?
            </h2>
            <p className="text-sm text-slate mt-2">
              It goes back to draft so you can correct it. The date it was first completed is kept, and the amended report will show both that date and the
              amendment date. Your reason is recorded in the audit log.
            </p>

            {sentCount > 0 ? (
              <p className="text-sm mt-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2" data-testid="amend-sent-warning">
                This report has already been sent to {sentCount} {sentCount === 1 ? "recipient" : "recipients"}
                {confirmedCount > 0 ? ` (${confirmedCount} confirmed it)` : ""}. Copies already sent will keep showing the earlier version, so you will need to
                generate and send the amended report again.
              </p>
            ) : hasReport ? (
              <p className="text-sm mt-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2" data-testid="amend-report-warning">
                A report was generated earlier. It keeps showing the earlier version until you generate it again.
              </p>
            ) : null}

            <form action={formAction} className="mt-4">
              <input type="hidden" name="inspectionId" value={inspectionId} />
              <label htmlFor="amend-reason" className="block text-sm font-medium text-ink">
                Reason for amending
              </label>
              <textarea
                id="amend-reason"
                ref={reasonRef}
                name="reason"
                required
                minLength={3}
                maxLength={500}
                rows={3}
                placeholder="e.g. Wrong condition recorded for the oven; missing photo of the bathroom"
                className="mt-1 w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:outline-none focus:border-signal"
              />
              {state?.error && (
                <p role="alert" className="text-sm text-red-600 mt-2">
                  {state.error}
                </p>
              )}
              <div className="flex justify-end gap-2 mt-4">
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className="text-sm px-4 py-2 rounded-lg border border-line text-slate hover:text-ink">
                  Cancel
                </button>
                <button type="submit" disabled={pending} className="text-sm px-4 py-2 rounded-lg bg-signal text-white font-medium disabled:opacity-60">
                  {pending ? "Amending…" : "Amend inspection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
