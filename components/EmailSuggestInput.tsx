"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { isValidEmail } from "@/lib/clientContacts";
import { sourceLabel, suggestFor, type Suggestion } from "@/lib/emailSuggestions";
import { highlightParts } from "@/lib/searchSelect";

// An email box that suggests addresses as you type a few letters (from saved clients, portal clients, the team and addresses used before), like a mail program.
// It is a normal text box underneath: anything can still be typed, and the page's own handling (Enter, comma, paste, blur) carries on exactly as before.
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "onKeyDown"> & {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  suggestions: Suggestion[];
  exclude?: string[]; // addresses already chosen
  onPick: (s: Suggestion) => void;
  wrapperClassName?: string;
};

export default function EmailSuggestInput({ value, onChange, onKeyDown, suggestions, exclude, onPick, wrapperClassName, onBlur, onFocus, ...rest }: Props) {
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [touched, setTouched] = useState(false); // an arrow key has been used: Enter then means "this one", not "what I typed"
  const [place, setPlace] = useState({ left: 0, width: 320 }); // where the list sits, so that it never runs off the edge of a narrow screen
  const shown = suggestFor(suggestions, value, { exclude, limit: 6 });
  const list = open ? shown : [];
  useLayoutEffect(() => {
    if (list.length === 0 || !root.current) return;
    const r = root.current.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 16);
    const overflow = r.left + width - (window.innerWidth - 8);
    setPlace({ left: overflow > 0 ? -Math.min(overflow, Math.max(0, r.left - 8)) : 0, width });
  }, [list.length, value]);
  const pick = (s: Suggestion) => { onPick(s); setOpen(false); setActive(0); setTouched(false); };
  const mark = (text: string) => highlightParts(text, value).map((p, k) => (p.match ? <mark key={k} className="bg-transparent font-semibold text-signal">{p.text}</mark> : <span key={k}>{p.text}</span>));

  return (
    <div ref={root} className={`relative ${wrapperClassName ?? ""}`} onBlur={(e) => { if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false); }}>
      <input
        {...rest}
        value={value}
        role="combobox"
        aria-expanded={list.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={list.length > 0 && list[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onFocus={(e) => { setOpen(true); onFocus?.(e); }}
        onBlur={onBlur}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); setTouched(false); }}
        onKeyDown={(e) => {
          if (list.length > 0) {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % list.length); setTouched(true); return; }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + list.length) % list.length); setTouched(true); return; }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); return; }
            // Enter or Tab take the highlighted suggestion, unless what is typed is already a whole address and no arrow key was used (then it is that address that is meant)
            if ((e.key === "Enter" || (e.key === "Tab" && !e.shiftKey)) && list[active] && (touched || !isValidEmail(value.trim()))) { e.preventDefault(); pick(list[active]); return; }
          }
          onKeyDown?.(e);
        }}
      />
      {list.length > 0 && (
        <ul id={listId} role="listbox" data-testid="email-suggestions" style={{ left: place.left, width: place.width }} className="absolute top-full z-30 mt-1 rounded-xl border border-line bg-white shadow-lg py-1" onMouseDown={(e) => e.preventDefault()}>
          {list.map((s, i) => (
            <li key={s.email} id={`${listId}-${i}`} role="option" aria-selected={i === active} data-email={s.email} onMouseEnter={() => setActive(i)} onClick={() => pick(s)} className={`px-3 py-2 min-h-[44px] cursor-pointer text-sm ${i === active ? "bg-signal/10" : ""}`}>
              <span className="block text-ink truncate">{mark(s.email)}</span>
              <span className="block text-xs text-slate truncate">{s.name ? <>{mark(s.name)} · </> : null}{sourceLabel(s.source)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
