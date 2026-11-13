"use client";

import { useActionState } from "react";
import { editCompletedInspection, type EditState } from "@/lib/actions/inspections";

// "Edit" on a completed inspection: one click takes it back to draft so it can be corrected. Nothing to type, no pop-up.
export default function EditInspectionButton({ inspectionId }: { inspectionId: string }) {
  const [state, formAction, pending] = useActionState<EditState | undefined, FormData>(editCompletedInspection, undefined);
  return (
    <form action={formAction} className="inline-flex flex-col items-start">
      <input type="hidden" name="inspectionId" value={inspectionId} />
      <button
        type="submit"
        disabled={pending}
        data-testid="edit-inspection"
        className="text-xs px-3 py-1.5 rounded-full border border-line text-slate hover:text-ink hover:border-ink transition-colors disabled:opacity-60"
      >
        {pending ? "Opening…" : "✎ Edit"}
      </button>
      {state?.error && (
        <p role="alert" className="text-xs text-red-600 mt-1">
          {state.error}
        </p>
      )}
    </form>
  );
}
