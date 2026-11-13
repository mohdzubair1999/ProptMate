"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeRichText } from "@/lib/richText";

const FONT_SIZES = [
  { label: "Small", px: 8 },
  { label: "Normal", px: 10 },
  { label: "Large", px: 13 },
  { label: "Extra large", px: 16 },
];

// A font-size <span> can't be applied with document.execCommand (its "fontSize" command only
// produces old-style, non-standard <font size="N"> tags), so the selected text is re-wrapped by
// hand using the Selection/Range API instead - the same approach, just done manually for this
// one case rather than left to the browser.
function applyFontSize(px: number) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  const span = document.createElement("span");
  span.style.fontSize = `${px}px`;
  try {
    span.appendChild(range.extractContents());
    range.insertNode(span);
    selection.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(span);
    selection.addRange(after);
  } catch {
    // A selection spanning a boundary execCommand/Range can't cleanly wrap (rare, e.g. across
    // two adjacent block elements) - leave the text untouched rather than risk corrupting it.
  }
}

export default function RichTextField({
  id,
  initialValue,
  onChange,
}: {
  id?: string;
  initialValue: string;
  onChange: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });

  // Only ever applied once, on mount - after that the DOM is the source of truth (an
  // uncontrolled field, same reasoning as AutoSaveField's plain textarea), since re-applying
  // innerHTML on every parent re-render would reset the cursor position mid-type.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = sanitizeRichText(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateActiveState = () => {
    try {
      setActive({ bold: document.queryCommandState("bold"), italic: document.queryCommandState("italic"), underline: document.queryCommandState("underline") });
    } catch {
      // queryCommandState can throw if the selection isn't inside this document - harmless, the
      // toolbar just doesn't highlight anything until the next valid selection.
    }
  };

  const handleInput = () => {
    if (!ref.current) return;
    onChange(sanitizeRichText(ref.current.innerHTML));
  };

  const exec = (command: string) => {
    ref.current?.focus();
    document.execCommand(command);
    updateActiveState();
    handleInput();
  };

  return (
    <div>
      <div className="flex items-center gap-1 mb-1 flex-wrap">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()} // keeps the text selection from being lost before the click registers
          onClick={() => exec("bold")}
          aria-label="Bold"
          aria-pressed={active.bold}
          className={`w-7 h-7 rounded border text-sm font-bold flex items-center justify-center ${active.bold ? "bg-ink text-white border-ink" : "border-line text-ink hover:border-signal"}`}
        >
          B
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("italic")}
          aria-label="Italic"
          aria-pressed={active.italic}
          className={`w-7 h-7 rounded border text-sm italic flex items-center justify-center ${active.italic ? "bg-ink text-white border-ink" : "border-line text-ink hover:border-signal"}`}
        >
          I
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")}
          aria-label="Underline"
          aria-pressed={active.underline}
          className={`w-7 h-7 rounded border text-sm underline flex items-center justify-center ${active.underline ? "bg-ink text-white border-ink" : "border-line text-ink hover:border-signal"}`}
        >
          U
        </button>
        <div className="w-px h-5 bg-line mx-1" />
        <select
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const px = parseInt(e.target.value, 10);
            if (px) {
              ref.current?.focus();
              applyFontSize(px);
              handleInput();
            }
            e.target.value = "";
          }}
          aria-label="Font size"
          className="h-7 border border-line rounded text-xs px-1.5 text-ink focus:outline-none focus:ring-2 focus:ring-signal"
        >
          <option value="" disabled>
            Size
          </option>
          {FONT_SIZES.map((s) => (
            <option key={s.px} value={s.px}>
              {s.label}
            </option>
          ))}
        </select>
        <div className="w-px h-5 bg-line mx-1" />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("insertUnorderedList")}
          aria-label="Bullet list"
          className="h-7 px-2 rounded border border-line text-xs text-ink hover:border-signal flex items-center justify-center"
        >
          • List
        </button>
      </div>
      <div
        ref={ref}
        id={id}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={updateActiveState}
        onMouseUp={updateActiveState}
        className="w-full min-h-[3.5rem] border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal [&_ul]:list-disc [&_ul]:pl-5"
      />
    </div>
  );
}
