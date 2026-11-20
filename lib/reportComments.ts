import type { DetailDefect, DetailItem, PhotoDetails } from "./photoDetails";

// Turning what the AI listed from the photos into the report's comments, in code: one bullet per ELEMENT, in the fixed layout
//     • Walls and ceiling: White emulsion walls, fair wear and tear. Faint low-level scuffs to lower areas.
// with, on a check-out, the check-in condition in brackets at the end of each bullet:  (Check-in: ...).
// Because the bullets are BUILT from the list, everything the AI listed (every item and every defect) is in the report: nothing is lost in a rewrite.
// Pure (no browser, no database, no network), so every rule is tested directly.

export const ELEMENT_ORDER = ["Walls and ceiling", "Flooring", "Skirting and architrave", "Windows", "Front door", "Doors", "Radiator", "Electrics and safety", "Kitchen units and worktop", "Appliances", "Bathroom fittings", "Fixtures", "Storage unit"] as const;

// which element an item belongs to, by its name: the first rule that matches wins, so the more specific words come first
const RULES: [RegExp, string][] = [
  [/\b(front door|entrance door|main door|external door|exterior door)\b/, "Front door"],
  [/\b(skirting|architrave|dado|picture rail|coving|cornice)\b/, "Skirting and architrave"],
  [/\b(smoke|heat|fire|carbon monoxide|co)\s+(alarm|detector)s?\b|\balarm|\bsockets?\b|\bswitch|\blights?\b|\blighting|\bbulb|\bpendant|\bdownlight|\bspotlight|\bconsumer unit|\bfuse|\bextractor fan|\bdoorbell|\bintercom|\bthermostat|\btv point|\baerial|\bcable|\bwiring|\bplug/, "Electrics and safety"],
  [/\b(radiators?|trv|towel rail|heater|boiler)\b/, "Radiator"],
  [/\b(mirror|mirrors|hook|hooks|towel|picture|pictures)\b/, "Fixtures"],
  [/\b(windows?|glazing|sill|sills|blinds?|curtains?|curtain pole|shutters?)\b/, "Windows"],
  [/\b(wardrobes?|cupboards?|drawers?|shelf|shelves|shelving|storage|cabinets?|bookcase)\b/, "Storage unit"],
  [/\b(worktops?|work tops?|splashback|kitchen units?|base units?|wall units?|sink|taps?|drainer)\b/, "Kitchen units and worktop"],
  [/\b(oven|hob|cooker|cooker hood|extractor hood|fridge|freezer|dishwasher|washing machine|dryer|microwave|appliances?)\b/, "Appliances"],
  [/\b(bath|shower|toilet|wc|basin|sanitaryware|cistern|bidet)\b/, "Bathroom fittings"],
  // a door of an appliance, or of a shower, belongs with that fitting: the generic door rule comes after those
  [/\b(doors?|door frame|handle|handles|hinges?|letterbox)\b/, "Doors"],
  [/\b(floors?|flooring|carpets?|laminate|vinyl|floorboards?|underlay|threshold|rugs?|mats?)\b/, "Flooring"],
  [/\b(walls?|ceilings?|paint|painted|paintwork|plaster|plasterwork|wallpaper|emulsion|artex|tiles?|tiling|grout)\b/, "Walls and ceiling"],
];

const norm = (s: unknown): string => String(typeof s === "string" ? s : "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const clean = (s: unknown): string => String(typeof s === "string" ? s : "").replace(/\s+/g, " ").trim();
const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const lowerFirst = (s: string): string => (s && !/^[A-Z]{2,}/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s); // keeps an abbreviation such as TV or WC as it is
const stripEnd = (s: string): string => clean(s).replace(/[\s.;,:]+$/, "");
const sentence = (s: string): string => { const t = stripEnd(s); return t ? `${cap(t)}.` : ""; };

export function elementFor(name: unknown): string {
  const n = norm(name);
  if (!n) return "Other";
  for (const [re, element] of RULES) if (re.test(n)) return element;
  return cap(clean(name).slice(0, 60)); // not a known element: it keeps its own name rather than being filed wrongly
}

const CONDITION_WORDS: Record<string, string> = { new: "as new", good: "good condition", wear_and_tear: "fair wear and tear", worn: "worn", damaged: "damaged", beyond_economical_repair: "beyond economical repair" };
const CLEAN_WORDS: Record<string, string> = { light_soiling: "light soiling", moderate_soiling: "moderate soiling", heavy_soiling: "heavy soiling" };
// the words that show a defect has already been written about, by its type
const DEFECT_STEMS: Record<string, string[]> = { crack: ["crack"], chip: ["chip"], scratch: ["scratch"], scuff: ["scuff"], stain: ["stain"], mould: ["mould", "mold"], damp_mark: ["damp"], burn: ["burn", "scorch"], dent: ["dent"], hole: ["hole"], peeling: ["peel"], rust: ["rust"], limescale: ["limescale", "scale"], grease: ["grease", "greasy"], missing_part: ["missing"], loose_fitting: ["loose"], discolouration: ["discolour", "discolor", "yellow", "fade"], wear: ["wear", "worn"], other: [] };

function itemSentences(it: DetailItem): string[] {
  const out: string[] = [];
  const name = clean(it.name), finish = clean(it.colourFinish);
  const hasFinish = finish && !norm(name).includes(norm(finish));
  let base = hasFinish ? `${finish} ${lowerFirst(name)}` : name;
  if (it.makeModel) base += ` (${clean(it.makeModel)})`;
  if (it.quantity) base += ` (${it.quantity} visible)`;
  const cond = it.condition ? CONDITION_WORDS[it.condition] : "";
  out.push(sentence(cond ? `${base}, ${cond}` : base));
  const seen = new Set<string>();
  for (const o of it.observations) { const s = sentence(o); const k = norm(s); if (s && !seen.has(k)) { seen.add(k); out.push(s); } }
  const soil = CLEAN_WORDS[it.cleanliness];
  if (soil) out.push(sentence(`${cap(soil)}${it.cleanlinessDetail ? ` (${stripEnd(it.cleanlinessDetail)})` : ""}`));
  if (it.newSinceCheckIn) out.push(sentence(it.newSinceCheckIn));
  return out.filter(Boolean);
}

function defectSentence(d: DetailDefect): string {
  const type = d.type.replace(/_/g, " ");
  return sentence(`${cap(type)} to ${lowerFirst(clean(d.item))}${d.location ? `, ${stripEnd(d.location)}` : ""}${d.extent ? ` (${stripEnd(d.extent)})` : ""}`);
}

// has this defect already been written about in these sentences? (its type word is there and, when it has a place, a word of that place too)
function mentioned(sentences: string[], d: DetailDefect): boolean {
  const stems = DEFECT_STEMS[d.type] ?? [];
  if (stems.length === 0) return false;
  const placeWords = norm(d.location).split(" ").filter((w) => w.length >= 4);
  return sentences.some((s) => { const n = norm(s); return stems.some((st) => n.includes(st)) && (placeWords.length === 0 || placeWords.some((w) => n.includes(w))); });
}

export type CheckInEntry = { element: string; text: string };
const CHECKIN_TAIL = /\s*\(Check-in:[^)]*\)\s*$/i;
const BULLET = /^\s*(?:[•\-*–]\s*)?([^:•\n]{2,60}):\s*(.+?)\s*$/;

// "• Walls and ceiling: text" lines as element and text (a line that is not in that layout is not a bullet)
export function parseBullets(text: unknown): CheckInEntry[] {
  const out: CheckInEntry[] = [];
  for (const raw of String(typeof text === "string" ? text : "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const m = BULLET.exec(line);
    if (!m) continue;
    if (!/^[•\-*–]/.test(line) && !/^[A-Z]/.test(m[1].trim())) continue;
    out.push({ element: clean(m[1]), text: clean(m[2]) });
  }
  return out;
}

const MAX_CHECKIN = 400;
function trimCheckIn(text: string): string {
  const t = clean(text).replace(CHECKIN_TAIL, "");
  if (t.length <= MAX_CHECKIN) return t;
  const cut = t.slice(0, MAX_CHECKIN);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "));
  return end > 120 ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export type Rendered = { text: string; elements: string[]; possible: string[] };

export function renderBullets(d: PhotoDetails, opts: { checkInText?: string | null } = {}): Rendered {
  const groups = new Map<string, { element: string; sentences: string[] }>();
  const group = (element: string) => { const k = norm(element); if (!groups.has(k)) groups.set(k, { element, sentences: [] }); return groups.get(k)!; };
  const itemGroup = new Map<DetailItem, { element: string; sentences: string[] }>();
  for (const it of d.items) { const g = group(elementFor(it.name)); itemGroup.set(it, g); g.sentences.push(...itemSentences(it)); }
  const possible: string[] = [];
  for (const df of d.defects) {
    if (df.confidence === "low") { possible.push(`${df.type.replace(/_/g, " ")} on ${df.item}${df.location ? `, ${df.location}` : ""}`); continue; } // a doubtful mark is for the inspector to look at, not a statement in the report
    const dn = norm(df.item);
    const owner = d.items.find((it) => { const n = norm(it.name); return n && dn && (n === dn || n.includes(dn) || dn.includes(n)); });
    const g = owner ? itemGroup.get(owner)! : group(elementFor(df.item));
    if (!mentioned(g.sentences, df)) { const s = defectSentence(df); if (s) g.sentences.push(s); }
  }
  for (const s of d.safety) { const t = sentence(s); if (t) group("Electrics and safety").sentences.push(t); }
  const order = (e: string) => { const i = (ELEMENT_ORDER as readonly string[]).findIndex((x) => norm(x) === norm(e)); return i === -1 ? ELEMENT_ORDER.length : i; };
  const list = [...groups.values()].filter((g) => g.sentences.length > 0).map((g, first) => ({ g, first })).sort((a, b) => order(a.g.element) - order(b.g.element) || a.first - b.first).map((x) => x.g);
  const checkIn = parseBullets(opts.checkInText);
  const plain = clean(opts.checkInText);
  const lines = list.map((g) => {
    const seen = new Set<string>(), parts = g.sentences.filter((s) => { const k = norm(s); if (seen.has(k)) return false; seen.add(k); return true; });
    let text = parts.join(" ");
    const match = checkIn.find((c) => norm(c.element) === norm(g.element));
    if (match) text += ` (Check-in: ${trimCheckIn(match.text)})`;
    else if (checkIn.length === 0 && plain && list.length === 1) text += ` (Check-in: ${trimCheckIn(plain)})`; // an unstructured check-in note is only attached when there is just one element to attach it to
    return `• ${g.element}: ${text}`;
  });
  return { text: lines.join("\n"), elements: list.map((g) => g.element), possible: [...new Set(possible)].slice(0, 10) };
}

// Bullets from several batches (a big set of photos is analysed a few at a time) as one report: the same element across batches is one bullet, in the usual
// order, with repeated sentences removed and the check-in note shown once. null when any block is not in the bullet layout, so the caller can fall back.
export function mergeBulletBlocks(blocks: string[]): string | null {
  const merged = new Map<string, { element: string; sentences: string[]; checkIn: string[] }>();
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const entries = parseBullets(b);
    if (entries.length === 0) return null;
    for (const e of entries) {
      const k = norm(e.element);
      if (!merged.has(k)) merged.set(k, { element: e.element, sentences: [], checkIn: [] });
      const m = merged.get(k)!;
      const tail = CHECKIN_TAIL.exec(e.text);
      if (tail) { const c = clean(tail[0]).replace(/^\(Check-in:\s*/i, "").replace(/\)$/, ""); if (c && !m.checkIn.some((x) => norm(x) === norm(c))) m.checkIn.push(c); }
      for (const s of clean(e.text.replace(CHECKIN_TAIL, "")).split(/(?<=\.)\s+/)) { const t = clean(s); if (t && !m.sentences.some((x) => norm(x) === norm(t))) m.sentences.push(t); }
    }
  }
  const order = (e: string) => { const i = (ELEMENT_ORDER as readonly string[]).findIndex((x) => norm(x) === norm(e)); return i === -1 ? ELEMENT_ORDER.length : i; };
  return [...merged.values()].map((m, first) => ({ m, first })).sort((a, b) => order(a.m.element) - order(b.m.element) || a.first - b.first)
    .map(({ m }) => `• ${m.element}: ${m.sentences.join(" ")}${m.checkIn.length ? ` (Check-in: ${m.checkIn.join("; ")})` : ""}`).join("\n");
}
