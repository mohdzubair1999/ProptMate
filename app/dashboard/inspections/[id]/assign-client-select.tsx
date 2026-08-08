"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { assignInspectionToClientDirect } from "@/lib/actions/portal";

export default function AssignClientSelect({
  inspectionId,
  clients,
  initialClientId,
}: {
  inspectionId: string;
  clients: { userId: string; label: string }[];
  initialClientId: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialClientId || "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const handleChange = async (newValue: string) => {
    setValue(newValue);
    setStatus("saving");
    try {
      await assignInspectionToClientDirect(inspectionId, newValue || null);
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("idle");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <select
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          className="flex-1 border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">Not assigned — I'll fill it out</option>
          {clients.map((c) => (
            <option key={c.userId} value={c.userId}>
              {c.label}
            </option>
          ))}
        </select>
        {status === "saving" && <span className="text-xs text-slate shrink-0">Saving…</span>}
        {status === "saved" && <span className="text-xs text-verified shrink-0">✓ Saved</span>}
      </div>
    </div>
  );
}
