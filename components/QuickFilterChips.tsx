"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

export default function QuickFilterChips({ chips }: { chips: { param: string; label: string }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const toggle = (param: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(param) === "1") params.delete(param);
    else params.set(param, "1");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {chips.map((chip) => {
        const active = searchParams.get(chip.param) === "1";
        return (
          <button
            key={chip.param}
            onClick={() => toggle(chip.param)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              active ? "bg-signal text-white border-signal" : "border-line text-slate hover:border-ink hover:text-ink"
            }`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
