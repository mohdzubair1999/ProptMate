"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  {
    href: "/dashboard",
    label: "Home",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12l9-9 9 9" />
        <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
      </svg>
    ),
  },
  {
    href: "/dashboard/properties",
    label: "Properties",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="3" width="16" height="18" rx="1" />
        <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 21v-4h6v4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/inspections",
    label: "Inspections",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="4" width="14" height="17" rx="1" />
        <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/tenants",
    label: "People",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
        <circle cx="17" cy="8" r="2.5" />
        <path d="M15.5 14.2c2.5.5 4.5 2.7 4.5 5.8" />
      </svg>
    ),
  },
  {
    href: "/dashboard/compliance",
    label: "Compliance",
    icon: (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
];

// Settings and Floor Plans live behind "More" rather than as direct tabs — a 7th and 8th
// icon squeezed into the bottom bar would make every tab harder to tap accurately, including
// the more frequently-used ones above. Both stay one tap away either way.
const MORE_ITEMS = [
  { href: "/dashboard/floor-plans", label: "Floor Plans" },
  { href: "/dashboard/settings", label: "Settings" },
];

function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function MobileTabBar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreActive = MORE_ITEMS.some((item) => pathname.startsWith(item.href));

  return (
    <>
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-ink/20" onClick={() => setMoreOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl overflow-hidden"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 68px)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {MORE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMoreOpen(false)}
                className="block px-6 py-4 text-sm text-ink border-b border-line last:border-0 active:bg-paper"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-line flex items-stretch z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TABS.map((tab) => {
          const active = tab.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors active:bg-paper ${
                active ? "text-signal" : "text-slate"
              }`}
            >
              {tab.icon(active)}
              <span className={`text-[10px] leading-none ${active ? "font-medium" : ""}`}>{tab.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMoreOpen((v) => !v)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors active:bg-paper ${
            moreActive || moreOpen ? "text-signal" : "text-slate"
          }`}
        >
          <MoreIcon active={moreActive || moreOpen} />
          <span className={`text-[10px] leading-none ${moreActive || moreOpen ? "font-medium" : ""}`}>More</span>
        </button>
      </nav>
    </>
  );
}
