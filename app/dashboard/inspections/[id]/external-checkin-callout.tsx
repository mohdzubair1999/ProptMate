"use client";

import { useEffect } from "react";
import MenuModal from "./menu-modal";
import ImportCheckInReport from "./import-checkin-report";

type Fields = Parameters<typeof ImportCheckInReport>[0]["templateFields"];

// A clear prompt on a draft check-out that has no check-in to compare against yet: "was the check-in done by someone else?". The
// upload used to be only a small button in the corner. When the person ticked "the check-in was done by someone else" while creating
// the check-out, the upload box opens straight away (autoOpen), and the "?upload=1" is then taken off the address so a refresh
// does not open it again.
export default function ExternalCheckInCallout({ inspectionId, templateFields, autoOpen }: { inspectionId: string; templateFields: Fields; autoOpen: boolean }) {
  useEffect(() => {
    if (!autoOpen) return;
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("upload")) {
        url.searchParams.delete("upload");
        window.history.replaceState(null, "", url.pathname + (url.search ? url.search : "") + url.hash);
      }
    } catch {
      /* the address is cosmetic: never in the way */
    }
  }, [autoOpen]);

  return (
    <div className="mb-4 rounded-xl border border-line bg-white p-4 flex flex-wrap items-center justify-between gap-3" data-testid="external-checkin-callout">
      <div className="min-w-0">
        <p className="font-semibold text-ink text-sm">Was the check-in done by someone else?</p>
        <p className="text-xs text-slate mt-0.5">Upload their report (a PDF or photos) and this check-out will compare against it.</p>
      </div>
      <MenuModal prominent defaultOpen={autoOpen} label="Upload their check-in report" icon="📄" title="Upload external check-in report">
        <ImportCheckInReport inspectionId={inspectionId} templateFields={templateFields} />
      </MenuModal>
    </div>
  );
}
