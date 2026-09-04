"use client";

import { useActionState } from "react";
import { removePageBreaksBeforeComments } from "@/lib/actions/templates";

export default function RemovePageBreaksButton() {
  const [state, formAction, pending] = useActionState(removePageBreaksBeforeComments, {});

  return (
    <div className="mt-3">
      <form
        action={(formData) => {
          if (
            window.confirm(
              "Remove the Page Break sitting right before Comments in every room, across all your templates? This affects every template you have — future inspections built from them won't have that forced break anymore. Past inspections and their existing reports aren't changed."
            )
          ) {
            formAction(formData);
          }
        }}
      >
        <button
          type="submit"
          disabled={pending}
          className="text-xs px-3 py-1.5 rounded-full border border-line text-slate hover:border-signal hover:text-signal transition-colors disabled:opacity-50"
        >
          {pending ? "Removing…" : "🧹 Remove page breaks before Comments (all templates)"}
        </button>
      </form>
      {typeof state?.removed === "number" && (
        <p className="text-xs text-verified mt-1.5">
          {state.removed === 0 ? "None found — nothing to remove." : `Removed ${state.removed} page break${state.removed === 1 ? "" : "s"}.`}
        </p>
      )}
      {state?.error && <p className="text-xs text-red-600 mt-1.5">{state.error}</p>}
    </div>
  );
}
