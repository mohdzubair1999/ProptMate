"use client";

import { useActionState } from "react";
import { removeTeamMember } from "@/lib/actions/team";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export default function RemoveTeamMemberButton({ userId, memberName }: { userId: string; memberName: string }) {
  const [state, formAction, pending] = useActionState(removeTeamMember, {});

  return (
    <div className="text-right">
      <form action={formAction}>
        <input type="hidden" name="userId" value={userId} />
        <ConfirmSubmitButton
          confirmMessage={`Remove ${memberName} from the team? Their past inspection work stays on record, but they'll lose access.`}
          className="text-xs text-red-600 hover:text-red-700 underline disabled:opacity-50"
          disabled={pending}
        >
          {pending ? "Removing…" : "Remove"}
        </ConfirmSubmitButton>
      </form>
      {/* Only ever shown on failure - a success re-renders the table from the server without this row at all. */}
      {state?.error && <p className="text-xs text-red-600 mt-1">{state.error}</p>}
    </div>
  );
}
