"use client";

import { useActionState } from "react";
import { movePageBreaksToSectionEnds } from "@/lib/actions/templates";

export default function FixPageBreaksButton() {
  const [state, formAction, pending] = useActionState(movePageBreaksToSectionEnds, {});

  return (
    <div className="mt-3">
      <form
        action={(formData) => {
          if (
            window.confirm(
              "Move any page break that sits in the middle of a section (for example between a room's item list and its Comments) to the end of that section, across all your templates? Each room's item list, Comments and Photos will then stay together, with the break after them. Any report you generate afterwards uses the new layout; reports already sent aren't affected."
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
          {pending ? "Fixing…" : "↧ Move page breaks to the end of each section (all templates)"}
        </button>
      </form>
      {typeof state?.moved === "number" && (
        <p className="text-xs text-verified mt-1.5">
          {state.moved === 0 && !state.removed
            ? "Nothing to change - every page break is already at the end of its section."
            : `Moved ${state.moved} page break${state.moved === 1 ? "" : "s"} to the end of their sections${state.removed ? ` and removed ${state.removed} extra` : ""}.`}
        </p>
      )}
      {state?.error && <p className="text-xs text-red-600 mt-1.5">{state.error}</p>}
    </div>
  );
}
