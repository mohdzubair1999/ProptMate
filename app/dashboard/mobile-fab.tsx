"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

// Floating action button — tapping it reveals both "Add property" and "New inspection" as
// separate options, rather than guessing which one the user wants based on the current page.
// Works identically everywhere in the app, so there's nothing to learn about how it behaves
// on different screens.
export default function MobileFab() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tapping anywhere outside the open menu closes it — standard behaviour for this kind of
  // popup, and avoids it staying open and blocking content underneath.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: Event) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="md:hidden fixed right-4 z-40 flex flex-col items-end gap-3"
      style={{ bottom: "calc(64px + env(safe-area-inset-bottom) + 12px)" }}
    >
      {open && (
        <>
          <Link
            href="/dashboard/properties/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 bg-white text-ink pl-4 pr-3 py-2.5 rounded-full shadow-lg border border-line active:scale-95 transition-transform"
          >
            <span className="text-sm font-medium">Add property</span>
            <span className="w-8 h-8 rounded-full bg-paper flex items-center justify-center text-signal">+</span>
          </Link>
          <Link
            href="/dashboard/inspections/new"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 bg-white text-ink pl-4 pr-3 py-2.5 rounded-full shadow-lg border border-line active:scale-95 transition-transform"
          >
            <span className="text-sm font-medium">New inspection</span>
            <span className="w-8 h-8 rounded-full bg-paper flex items-center justify-center text-signal">+</span>
          </Link>
        </>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Add new"}
        aria-expanded={open}
        className="bg-signal text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
      >
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(45deg)" : "rotate(0deg)" }}
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
