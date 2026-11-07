import { SYMBOLS, SYMBOL_KINDS, cleanLabelText, isPin, isSymbolKind, type PlanObject } from "./floorPlanObjects";

// The KEY printed on the plan sheet: a small picture and name for each safety or services symbol used on the floor, and the note for each numbered defect pin.
// Pure (no browser, no database) so what goes in it is tested directly.
export type SheetKey = { symbols: string[]; notes: { n: number; text: string }[] };
export const MAX_KEY_SYMBOLS = 12;
export const MAX_KEY_NOTES = 30;
export const KEY_GROUP = "Safety and services"; // furniture is self-explanatory; the alarms, meters and stopcock are not

// from a floor's objects. undefined when there is nothing to explain (so a floor with no such symbols and no pins gets no key at all)
export function buildSheetKey(objects: unknown): SheetKey | undefined {
  const list = (Array.isArray(objects) ? objects : []) as PlanObject[];
  const used = new Set<string>();
  for (const o of list) if (o && o.kind === "symbol" && isSymbolKind(o.symbol) && SYMBOLS[o.symbol].group === KEY_GROUP) used.add(o.symbol);
  const symbols = SYMBOL_KINDS.filter((k) => used.has(k)).slice(0, MAX_KEY_SYMBOLS); // in the catalogue's order, so the same plan always gives the same key
  const notes = list.filter((o) => o && isPin(o)).map((o) => ({ n: (o as { pin: number }).pin, text: cleanLabelText((o as { text: string }).text) })).sort((a, b) => a.n - b.n).slice(0, MAX_KEY_NOTES);
  return symbols.length === 0 && notes.length === 0 ? undefined : { symbols, notes };
}

// For a saved snapshot read back from storage (untrusted): only real symbol names from the key's group, real pin numbers, cleaned text, and the same limits.
export function cleanSheetKey(raw: unknown): SheetKey | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const symbols: string[] = [];
  for (const s of Array.isArray(o.symbols) ? o.symbols : []) if (isSymbolKind(s) && SYMBOLS[s].group === KEY_GROUP && !symbols.includes(s) && symbols.length < MAX_KEY_SYMBOLS) symbols.push(s);
  symbols.sort((a, b) => SYMBOL_KINDS.indexOf(a as never) - SYMBOL_KINDS.indexOf(b as never));
  const notes: { n: number; text: string }[] = [];
  for (const it of Array.isArray(o.notes) ? o.notes : []) {
    if (!it || typeof it !== "object" || notes.length >= MAX_KEY_NOTES) continue;
    const n = (it as Record<string, unknown>).n, text = cleanLabelText((it as Record<string, unknown>).text);
    if (typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 99 && text) notes.push({ n, text });
  }
  notes.sort((a, b) => a.n - b.n);
  return symbols.length === 0 && notes.length === 0 ? undefined : { symbols, notes };
}
