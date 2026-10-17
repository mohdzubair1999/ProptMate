"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateClientRelation } from "@/lib/actions/portal";

export default function RelationSelect({ accessId, initialRelation }: { accessId: string; initialRelation: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialRelation);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");

  const handleChange = async (newValue: "TENANT" | "LANDLORD") => {
    setValue(newValue);
    setStatus("saving");
    try {
      await updateClientRelation(accessId, newValue);
      setStatus("saved");
      router.refresh();
      setTimeout(() => setStatus("idle"), 1200);
    } catch {
      setStatus("idle");
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        value={value}
        onChange={(e) => handleChange(e.target.value as "TENANT" | "LANDLORD")}
        className="text-xs border border-line rounded-full px-2 py-1 text-slate bg-white capitalize"
      >
        <option value="TENANT">Tenant</option>
        <option value="LANDLORD">Landlord</option>
      </select>
      {status === "saving" && <span className="text-xs text-slate">Saving…</span>}
      {status === "saved" && <span className="text-xs text-verified">✓</span>}
    </div>
  );
}
