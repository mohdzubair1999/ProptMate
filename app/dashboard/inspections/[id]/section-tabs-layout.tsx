"use client";

import { useState, useEffect } from "react";

export type SectionTab = { id: string; title: string; content: React.ReactNode };

// Every section's content is still fully rendered server-side, exactly as before — this
// component only changes how they're arranged visually.
//
// Only one layout (mobile accordion or desktop sidebar) is ever actually mounted at a time,
// controlled by real viewport detection rather than CSS-only hidden/md:hidden classes. This
// matters: each section's content contains form fields with fixed ids that targetId-based
// features (AI photo analysis, the polish button, voice input) look up directly — if both
// layouts existed in the DOM at once (one just CSS-hidden), those ids would be duplicated,
// and a lookup would silently hit whichever copy happens to come first in DOM order rather
// than the one actually visible to the person using it.
//
// Within whichever layout is mounted, every section stays mounted at all times — only the
// active one is shown (via CSS display, not conditional rendering), so switching between
// sections never unmounts a field mid-edit and can't lose anything an auto-save had queued up.
export default function SectionTabsLayout({ sections }: { sections: SectionTab[] }) {
  const [activeId, setActiveId] = useState<string | undefined>(sections[0]?.id);
  // Starts as mobile (before mount, the real viewport isn't known yet) — inspectors are
  // typically on their phone walking through a property, so this is the more likely case, and
  // whichever isn't the default briefly flashes the wrong layout before switching once mounted.
  const [isDesktop, setIsDesktop] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)"); // matches Tailwind's md: breakpoint
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // If the set of sections changes shape (e.g. a section gets hidden/unhidden) and the
  // currently active tab no longer exists, fall back to the first available tab rather than
  // silently showing nothing.
  useEffect(() => {
    if (!sections.some((s) => s.id === activeId)) {
      setActiveId(sections[0]?.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections.map((s) => s.id).join(",")]);

  if (sections.length === 0) return null;

  if (isDesktop === false) {
    // Mobile: true accordion — each section's content sits directly below its own button,
    // so tapping a room expands it right there rather than at the bottom of the whole list.
    return (
      <div className="mt-8 space-y-2">
        {sections.map((s) => (
          <div key={s.id}>
            <button
              type="button"
              onClick={() => setActiveId((current) => (current === s.id ? undefined : s.id))}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                activeId === s.id ? "bg-ink text-white" : "bg-white border border-line text-ink hover:border-ink"
              }`}
            >
              {s.title}
            </button>
            <div style={{ display: activeId === s.id ? "block" : "none" }} className="mt-2">
              {s.content}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Desktop/tablet (and the default before viewport is known): sidebar alongside a shared
  // content area. Falls back to the first section if activeId is empty - this can genuinely
  // happen if someone collapses a mobile accordion section (leaving activeId unset) and then
  // the viewport transitions to desktop width (tablet rotation, window resize) before they
  // pick a new one; unlike the mobile accordion, desktop should never show a blank content
  // area with nothing selected.
  const desktopActiveId = sections.some((s) => s.id === activeId) ? activeId : sections[0]?.id;

  return (
    <div className="mt-8 flex gap-6 items-start">
      <nav className="w-52 shrink-0 sticky top-4 self-start">
        <div className="space-y-1">
          {sections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                desktopActiveId === s.id ? "bg-ink text-white" : "text-slate hover:bg-paper hover:text-ink"
              }`}
            >
              {s.title}
            </button>
          ))}
        </div>
      </nav>

      <div className="flex-1 min-w-0">
        {sections.map((s) => (
          <div key={s.id} style={{ display: desktopActiveId === s.id ? "block" : "none" }}>
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}
