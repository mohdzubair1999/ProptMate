// Searching a list of choices (for example the company's properties) as the person types. Pure (no screen, no database), so every rule is tested directly.
//
// How it matches: the words typed are matched in ANY order, ignoring capitals, accents, punctuation and extra spaces, and every word must be found somewhere in the
// choice's name, its small second line (for example a postcode) or its extra search words (for example a landlord's name). "2 tudor" finds "2 Tudor House" before
// "12 Tudor House"; "tudor 2" finds the same; a postcode typed without its space ("al109ab") still finds "AL10 9AB". The best matches come first, and only the first
// few are shown so a list of thousands stays quick.

export type PickerOption = { value: string; label: string; hint?: string; keywords?: string[] };
export const DEFAULT_LIMIT = 50;
const MAX_WORDS = 8;
const MAX_QUERY = 200;

// lower case, accents removed, anything that is not a letter or digit becomes one space
export function normaliseForSearch(s: unknown): string {
  return String(typeof s === "string" ? s : "").slice(0, 2000).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function words(q: unknown): string[] {
  return normaliseForSearch(typeof q === "string" ? q.slice(0, MAX_QUERY) : "").split(" ").filter(Boolean).slice(0, MAX_WORDS);
}

type Scored = { option: PickerOption; score: number; index: number };

function scoreOption(option: PickerOption, ws: string[], whole: string): number {
  const label = normaliseForSearch(option.label);
  const rest = normaliseForSearch([option.hint ?? "", ...(Array.isArray(option.keywords) ? option.keywords : [])].join(" "));
  const hay = `${label} ${rest}`;
  const compact = hay.replace(/ /g, "");
  const labelWords = label.split(" ");
  const restWords = rest.split(" ");
  let score = 0;
  for (const w of ws) {
    if (label.startsWith(w)) score += 30;
    else if (labelWords.some((x) => x.startsWith(w))) score += 20;
    else if (restWords.some((x) => x.startsWith(w))) score += 10;
    else if (hay.includes(w)) score += 3;
    else if (compact.includes(w)) score += 2; // a postcode typed without its space
    else return -1; // every word must be found somewhere
  }
  if (whole && label === whole) score += 100;
  else if (whole && label.startsWith(whole)) score += 40;
  return score;
}

export function filterOptions(options: PickerOption[], query: unknown, limit: number = DEFAULT_LIMIT): { shown: PickerOption[]; matched: number; total: number } {
  const list = Array.isArray(options) ? options.filter((o) => o && typeof o.value === "string" && typeof o.label === "string") : [];
  const max = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 1000) : DEFAULT_LIMIT;
  const ws = words(query);
  if (ws.length === 0) return { shown: list.slice(0, max), matched: list.length, total: list.length }; // nothing typed: everything, in the order given
  const whole = ws.join(" ");
  const scored: Scored[] = [];
  list.forEach((option, index) => { const score = scoreOption(option, ws, whole); if (score >= 0) scored.push({ option, score, index }); });
  scored.sort((a, b) => b.score - a.score || a.index - b.index); // best first; equal scores keep the order they were given (the list is already A to Z)
  return { shown: scored.slice(0, max).map((s) => s.option), matched: scored.length, total: list.length };
}

// The text split into pieces so the typed words can be shown in bold. Matching ignores capitals; accents are matched only when typed the same way.
export function highlightParts(text: unknown, query: unknown): { text: string; match: boolean }[] {
  const t = typeof text === "string" ? text : "";
  const ws = [...new Set(words(query))].filter((w) => w.length > 0).sort((a, b) => b.length - a.length);
  if (!t || ws.length === 0) return t ? [{ text: t, match: false }] : [];
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const out: { text: string; match: boolean }[] = [];
  let last = 0;
  for (const m of t.matchAll(re)) {
    if (m.index === undefined || m[0].length === 0) continue;
    if (m.index > last) out.push({ text: t.slice(last, m.index), match: false });
    out.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push({ text: t.slice(last), match: false });
  return out.length > 0 ? out : [{ text: t, match: false }];
}

export const labelFor = (options: PickerOption[], value: unknown): string => (Array.isArray(options) && typeof value === "string" && value ? (options.find((o) => o && o.value === value)?.label ?? "") : "");
