"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function DateRangeFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-slate">From</label>
      <input
        type="date"
        defaultValue={searchParams.get("dateFrom") || ""}
        onChange={(e) => updateParam("dateFrom", e.target.value)}
        className="border border-line rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />
      <label className="text-xs text-slate">To</label>
      <input
        type="date"
        defaultValue={searchParams.get("dateTo") || ""}
        onChange={(e) => updateParam("dateTo", e.target.value)}
        className="border border-line rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />
    </div>
  );
}
