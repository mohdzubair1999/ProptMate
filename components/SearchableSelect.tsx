"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { DEFAULT_LIMIT, filterOptions, highlightParts, labelFor, type PickerOption } from "@/lib/searchSelect";

// A drop-down you can SEARCH, for long lists such as a company's properties. Type any part of the address, postcode or landlord (words in any order), then pick with
// the arrow keys and Enter, or by tapping. It takes the place of a <select> in a form: the chosen value is carried by a hidden field with the given name, so forms and
// server actions work exactly as before. It can be controlled (value + onChange, which keeps the choice through a failed submit) or uncontrolled (defaultValue).
type Props = {
  options: PickerOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  emptyLabel?: string; // when set, the first choice is a real "none" (value ""), such as "No template": it is shown as the starting choice and the field may stay empty
  noun?: string; // "property"
  nounPlural?: string; // "properties"
  autoFocus?: boolean;
};

export default function SearchableSelect({ options: given, name, value, defaultValue, onChange, placeholder = "Search…", required, disabled, id, ariaLabel, emptyLabel, noun = "choice", nounPlural, autoFocus }: Props) {
  const plural = nounPlural ?? `${noun}s`;
  const options = useMemo(() => (emptyLabel ? [{ value: "", label: emptyLabel }, ...given] : given), [given, emptyLabel]);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [inner, setInner] = useState(defaultValue ?? "");
  const selected = controlled ? (value as string) : inner;
  const selectedLabel = selected === "" && emptyLabel ? emptyLabel : labelFor(options, selected);
  const [text, setText] = useState(selectedLabel);
  const [typed, setTyped] = useState(false); // the person has typed something (so the list is filtered by it)
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const userEditing = useRef(false); // typing clears the choice; that change must not wipe the text being typed
  const before = useRef(""); // the choice you had when you started typing over it: Escape (cancel) puts it back

  const commit = (v: string) => { if (!controlled) setInner(v); onChange?.(v); };

  // The visible text follows the chosen value (a choice made elsewhere, a form reset, the choice being cleared) unless the person is typing
  useEffect(() => {
    if (userEditing.current) { userEditing.current = false; return; }
    setTyped(false);
    setText(selectedLabel);
  }, [selected, selectedLabel]);

  // a required field with nothing chosen blocks the form with a clear message, even when words have been typed
  useEffect(() => {
    inputRef.current?.setCustomValidity(required && !selected && !emptyLabel ? `Please choose a ${noun} from the list.` : "");
  }, [required, selected, noun, emptyLabel]);

  // when the form is reset (as the invite form does after success) go back to the starting choice
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const onReset = () => setTimeout(() => { setTyped(false); if (!controlled) setInner(defaultValue ?? ""); const v = controlled ? value : defaultValue; setText(!v && emptyLabel ? emptyLabel : labelFor(options, v)); }, 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [controlled, defaultValue, options, value, emptyLabel]);

  const query = typed ? text : "";
  const { shown, matched, total } = useMemo(() => filterOptions(options, query, DEFAULT_LIMIT), [options, query]);
  const nothing = shown.length === 0;

  useEffect(() => { if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" }); }, [active, open, listId]);

  const closeAndRestore = () => { setOpen(false); setTyped(false); setText(selectedLabel); };
  const choose = (o: PickerOption) => { before.current = ""; commit(o.value); setText(o.label); setTyped(false); setOpen(false); };
  // Escape means cancel: close the list, and if you had started typing over a choice, put that choice back
  const cancel = () => {
    if (before.current && !selected) { const prev = before.current; before.current = ""; commit(prev); setText(labelFor(options, prev)); setTyped(false); setOpen(false); return; }
    closeAndRestore();
  };

  // clicking or tabbing away closes the list; a half-typed search with no choice is left as it is (the form will not submit it, because nothing is chosen)
  const onBlur = (e: React.FocusEvent) => {
    if (rootRef.current?.contains(e.relatedTarget as Node | null)) return;
    setOpen(false);
    if (selected || emptyLabel) { setTyped(false); setText(selectedLabel); }
  };

  const statusText = nothing ? `No ${plural} match “${query.trim()}”.` : `${matched} ${matched === 1 ? noun : plural}${matched > shown.length ? `, showing the first ${shown.length}` : ""}`;

  return (
    <div ref={rootRef} className="relative" onBlur={onBlur}>
      {name && <input type="hidden" name={name} value={selected} />}
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
        aria-label={ariaLabel}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        required={required}
        disabled={disabled}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={text}
        onFocus={(e) => { e.currentTarget.select(); setOpen(true); }}
        onClick={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setTyped(true);
          setOpen(true);
          setActive(0);
          if (selected) { before.current = selected; userEditing.current = true; commit(""); } // typing again means "I am choosing another": the old choice is no longer the answer, so a half-typed search can never be submitted as the old property
          else if (emptyLabel) userEditing.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); if (!open) { setOpen(true); setActive(0); } else if (shown.length) setActive((a) => (a + 1) % shown.length); }
          else if (e.key === "ArrowUp") { e.preventDefault(); if (!open) setOpen(true); else if (shown.length) setActive((a) => (a - 1 + shown.length) % shown.length); }
          else if (e.key === "Enter") { if (open && shown[active]) { e.preventDefault(); choose(shown[active]); } }
          else if (e.key === "Escape") { if (open) { e.preventDefault(); e.stopPropagation(); cancel(); } }
          else if (e.key === "Tab") setOpen(false);
        }}
        className="w-full border border-line rounded-lg pl-3 pr-9 py-2 text-base sm:text-sm text-ink bg-white focus:outline-none focus:ring-2 focus:ring-signal disabled:opacity-60"
      />
      {(emptyLabel ? selected : text || selected) && !disabled && (
        <button
          type="button"
          aria-label="Clear"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { before.current = ""; commit(""); setText(emptyLabel ?? ""); setTyped(false); setActive(0); setOpen(true); inputRef.current?.focus(); }}
          className="absolute right-1 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-slate hover:text-ink flex items-center justify-center"
          data-testid="picker-clear"
        >
          ×
        </button>
      )}
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-line bg-white shadow-lg" onMouseDown={(e) => e.preventDefault()} data-testid="picker-popup">
          <p className="px-3 pt-2 pb-1 text-xs text-slate" data-testid="picker-summary">{statusText}{matched > shown.length ? ". Keep typing to narrow it down." : ""}</p>
          <ul id={listId} role="listbox" aria-label={ariaLabel} className="max-h-72 overflow-auto pb-1" data-testid="picker-list">
            {shown.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={o.value === selected}
                data-value={o.value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                className={`px-3 py-2.5 min-h-[44px] cursor-pointer text-sm ${i === active ? "bg-signal/10" : ""} ${o.value === selected ? "font-medium" : ""}`}
              >
                <span className="text-ink">{highlightParts(o.label, query).map((p, k) => (p.match ? <mark key={k} className="bg-transparent font-semibold text-signal">{p.text}</mark> : <span key={k}>{p.text}</span>))}</span>
                {o.value === selected && <span className="ml-2 text-signal" aria-hidden="true">✓</span>}
                {o.hint && <span className="block text-xs text-slate">{highlightParts(o.hint, query).map((p, k) => (p.match ? <mark key={k} className="bg-transparent font-semibold text-signal">{p.text}</mark> : <span key={k}>{p.text}</span>))}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="sr-only" role="status" aria-live="polite">{open ? statusText : ""}</p>
    </div>
  );
}
