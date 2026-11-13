"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type FilterOption = { value: string; label: string };
type Filter = { param: string; label: string; options: FilterOption[] };

export default function SearchFilterBar({ searchPlaceholder, filters }: { searchPlaceholder: string; filters: Filter[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchValue, setSearchValue] = useState(searchParams.get("q") || "");

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      router.push(`${pathname}?${params.toString()}`);
    },
    [searchParams, pathname, router]
  );

  // Debounced so typing doesn't fire a request on every keystroke — 350ms feels responsive
  // without hammering the server while someone's still typing.
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchValue !== (searchParams.get("q") || "")) updateParam("q", searchValue);
    }, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const hasActiveFilters = searchParams.get("q") || filters.some((f) => searchParams.get(f.param));

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder={searchPlaceholder}
        className="flex-1 min-w-[200px] border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />
      {filters.map((filter) => (
        <select
          key={filter.param}
          value={searchParams.get(filter.param) || ""}
          onChange={(e) => updateParam(filter.param, e.target.value)}
          className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="">{filter.label}</option>
          {filter.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      {hasActiveFilters && (
        <button
          onClick={() => {
            setSearchValue("");
            router.push(pathname);
          }}
          className="text-sm text-slate hover:text-ink underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
