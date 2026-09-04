"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setComparisonInspection } from "@/lib/actions/inspections";

export default function ComparisonSelect({
  inspectionId,
  options,
  initialValue,
}: {
  inspectionId: string;
  options: { id: string; label: string; sameTemplate: boolean }[];
  initialValue: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialValue || "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const handleChange = async (newValue: string) => {
    setValue(newValue);
    setStatus("saving");
    try {
      await setComparisonInspection(inspectionId, newValue || null);
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 1200);
    } catch {
      setStatus("idle");
    }
  };

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      >
        <option value="">No comparison</option>
        {options.map((o) => (
          <option key={o.id} value={o.id} disabled={!o.sameTemplate}>
            {o.label}
            {!o.sameTemplate ? " — different template, can't compare" : ""}
          </option>
        ))}
      </select>
      {status === "saving" && <span className="text-xs text-slate shrink-0">Saving…</span>}
      {status === "saved" && <span className="text-xs text-verified shrink-0">✓ Saved</span>}
    </div>
  );
}
