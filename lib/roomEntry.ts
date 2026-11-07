import { parseDimensionText, plausibilityWarnings, MAX_ROOM_M, MIN_ROOM_M } from "@/lib/sketchPlan";

// Quick entry of rooms: type, paste or dictate "Lounge 4.5 x 3.8, Kitchen 3.2 x 3.8, Bedroom one 3.6 x 3.4" and get rooms.
// No AI and no cost. It is anchored on the SIZES it finds (two measurements joined by x or "by"); the words in front of each
// size are that room's name. That one rule makes commas, "and", new lines and spoken lists all behave the same way.
// Pure functions, so every rule is tested.

export type ParsedRoom = { name: string; widthM: number; lengthM: number; isGarden: boolean; isStairs: boolean; sizeText: string };
export type RoomEntryResult = { rooms: ParsedRoom[]; problems: { text: string; reason: string }[]; warnings: string[] };
export type RoomEntryOptions = { defaultUnit?: "m" | "ft"; existingNames?: string[] };

export const MAX_ROOMS_PER_ENTRY = 40;
const MAX_INPUT = 4000;

// ---- spoken numbers -------------------------------------------------------------------------------------------------
const ONES: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const isNumberWord = (w: string) => w in ONES || w in TENS;

// "four point five" -> 4.5, "twelve feet six" -> "12 feet 6", "three and a half" -> 3.5, "bedroom one" -> "bedroom 1".
export function spokenToDigits(text: string): string {
  const words = text.replace(/(?<!\d)([,;:])|([,;:])(?!\d)/g, " $1$2 ").replace(/\n/g, " ; ").split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const lw = words[i].toLowerCase();
    // digits, then "point", then digits spoken or written: "4 point 5"
    if (/^\d+$/.test(words[i]) && words[i + 1]?.toLowerCase() === "point" && (words[i + 2] in ONES || /^\d+$/.test(words[i + 2] ?? ""))) {
      let k = i + 2, digits = "";
      while (k < words.length && (/^\d$/.test(words[k]) || (words[k].toLowerCase() in ONES && ONES[words[k].toLowerCase()] <= 9))) { digits += /^\d$/.test(words[k]) ? words[k] : String(ONES[words[k].toLowerCase()]); k++; }
      if (digits) { out.push(`${words[i]}.${digits}`); i = k; continue; }
    }
    if (!isNumberWord(lw)) { out.push(words[i]); i++; continue; }
    // Only real compound numbers combine: tens + units ("twenty five"), and "hundred". Two plain digits in a row ("one four")
    // are two separate numbers (a room number, then the first measurement), never added together.
    let value = 0, j = i, last: "start" | "ones" | "teens" | "tens" | "tensones" | "hundred" | "and" = "start";
    while (j < words.length) {
      const w = words[j].toLowerCase();
      if (w in ONES) {
        const v = ONES[w];
        if (v >= 10 ? !(last === "start" || last === "hundred" || last === "and") : !(last === "start" || last === "tens" || last === "hundred" || last === "and")) break;
        value += v; last = v >= 10 ? "teens" : last === "tens" ? "tensones" : "ones"; j++;
      } else if (w in TENS) {
        if (!(last === "start" || last === "hundred" || last === "and")) break;
        value += TENS[w]; last = "tens"; j++;
      } else if (w === "hundred" && (last === "ones") && value < 10) { value *= 100; last = "hundred"; j++; }
      else if (w === "and" && last === "hundred" && words[j + 1] && isNumberWord(words[j + 1].toLowerCase())) { last = "and"; j++; }
      else break;
    }
    if (words[j]?.toLowerCase() === "point" && words[j + 1] && (words[j + 1].toLowerCase() in ONES) && ONES[words[j + 1].toLowerCase()] <= 9) {
      let k = j + 1, digits = "";
      while (k < words.length && words[k].toLowerCase() in ONES && ONES[words[k].toLowerCase()] <= 9) { digits += ONES[words[k].toLowerCase()]; k++; }
      out.push(`${value}.${digits}`); i = k; continue;
    }
    if (words[j]?.toLowerCase() === "and" && words[j + 1]?.toLowerCase() === "a" && words[j + 2]?.toLowerCase() === "half") { out.push(String(value + 0.5)); i = j + 3; continue; }
    out.push(String(value)); i = j;
  }
  return out.join(" ").replace(/\s+([,;:])/g, "$1");
}

// ---- finding sizes ---------------------------------------------------------------------------------------------------
const FT = String.raw`\d+(?:\.\d+)?\s*(?:'|ft\.?|feet|foot)\s*(?:-\s*)?(?:\d+(?:\.\d+)?\s*(?:"|in(?:ches|ch)?\.?)?)?`;
const MET = String.raw`\d+(?:[.,]\d+)?(?:\s*(?:mm|cm|m(?:etres?|eters?)?|mtrs?)(?!(?!x)[a-z]))?`;
const SEP = String.raw`\s*(?:x|by|\u00d7|\*|times)\s*`;
const SIZE_RE = () => new RegExp(`(${FT}|${MET})${SEP}(${FT}|${MET})`, "gi");

// A bare number with no unit: read it the way a person would mean it, and refuse the ones that could mean anything.
function bare(n: number, unit: "m" | "ft"): number | null {
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === "ft") return n <= 60 ? n * 0.3048 : n >= 1000 && n <= 30000 ? n / 1000 : null;
  if (n <= 30) return n;
  if (n >= 1000 && n <= 30000) return n / 1000; // millimetres
  if (n >= 100 && n <= 999) return n / 100; // centimetres
  return null; // 31 to 99: could be feet, centimetres or a typing slip
}
type Unit = "mm" | "cm" | "m" | "ft";
// The unit written on a measurement, if any.
function unitWord(token: string): Unit | null {
  if (/mm\b/i.test(token)) return "mm";
  if (/cm\b/i.test(token)) return "cm";
  if (/ft|feet|foot|'|"/i.test(token)) return "ft";
  if (/\dm(?:etres?|eters?|trs?)?\b|\sm(?:etres?|eters?|trs?)?\b/i.test(token)) return "m";
  return null;
}
// A bare number takes the unit written on the OTHER side ("12 x 10 ft", "450 x 380cm"); with none anywhere, the chosen default.
function toMetres(raw: string, unit: "m" | "ft", otherSide: Unit | null): number | null {
  const t = raw.trim();
  if (/^\d+(?:[.,]\d+)?$/.test(t)) {
    const n = parseFloat(t.replace(",", "."));
    if (!otherSide) return bare(n, unit);
    if (!Number.isFinite(n) || n <= 0) return null;
    return otherSide === "ft" ? (n <= 60 ? n * 0.3048 : null) : otherSide === "mm" ? n / 1000 : otherSide === "cm" ? n / 100 : n;
  }
  return parseDimensionText(t, "unknown");
}

// ---- names ------------------------------------------------------------------------------------------------------------
const LEAD = /^(?:and|then|next|also|plus|with|the|a|an|there is|there's|we have)\b[\s,;:]*/i;
const TRAIL = /\b(?:is|are|at|about|around|approx(?:imately)?|measures?|measuring|size|sized|of|=|:)\s*$/i;
const ACRONYMS: Record<string, string> = { wc: "WC", hmo: "HMO", wic: "WIC", tv: "TV", ensuite: "En-suite", "en-suite": "En-suite" };
function tidyName(raw: string): string {
  let s = raw.replace(/[<>]/g, "").replace(/\s+/g, " ").replace(/^[\s,;:.\-\u2013\u2014]+|[\s,;:.\-\u2013\u2014]+$/g, "");
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(LEAD, "").replace(TRAIL, "").replace(/^[\s,;:.\-\u2013\u2014]+|[\s,;:.\-\u2013\u2014]+$/g, "");
    if (s === before) break;
  }
  s = s.slice(0, 60).trim();
  // typed in lower case: give it capitals, and keep the common abbreviations right
  if (s === s.toLowerCase()) s = s.replace(/(^|[\s/(])([a-z])/g, (_m, a, b) => a + b.toUpperCase()).replace(/\b[A-Za-z]+(?:-[A-Za-z]+)?\b/g, (w) => ACRONYMS[w.toLowerCase()] ?? w);
  else s = s.charAt(0).toUpperCase() + s.slice(1);
  return s;
}
const OUTDOOR = /\b(garden|patio|yard|terrace|balcony|driveway|decking|courtyard|lawn)\b/i;
const STAIRS = /\b(stairs?|staircase)\b/i;

export function parseRoomList(input: string, opts: RoomEntryOptions = {}): RoomEntryResult {
  const unit = opts.defaultUnit === "ft" ? "ft" : "m";
  const result: RoomEntryResult = { rooms: [], problems: [], warnings: [] };
  if (typeof input !== "string" || !input.trim()) return result;
  let text = input.slice(0, MAX_INPUT);
  if (input.length > MAX_INPUT) result.warnings.push("The list was very long, so only the first part was read.");
  text = spokenToDigits(text)
    .replace(/[\u2032\u2019\u2018`\u00b4]/g, "'")
    .replace(/[\u2033\u201d\u201c]/g, '"')
    .replace(/\s+/g, " ")
    .trim();

  const matches = [...text.matchAll(SIZE_RE())];
  if (matches.length === 0) {
    result.problems.push({ text: text.slice(0, 80), reason: "No size found. Write each room like: Lounge 4.5 x 3.8" });
    return result;
  }
  // Names normally come BEFORE their size ("Lounge 4.5 x 3.8"). If the text opens with a size, they come AFTER ("4.5 x 3.8 lounge").
  const leading = text.slice(0, matches[0].index).replace(/[\s,;:.\-]+/g, "");
  const after = leading === "";
  const used = new Set<string>((opts.existingNames ?? []).map((n) => n.trim().toLowerCase()).filter(Boolean));

  matches.forEach((m, i) => {
    const start = m.index!, end = start + m[0].length;
    const nameRaw = after ? text.slice(end, matches[i + 1]?.index ?? text.length) : text.slice(i === 0 ? 0 : matches[i - 1].index! + matches[i - 1][0].length, start);
    const sizeText = m[0].trim();
    if (result.rooms.length >= MAX_ROOMS_PER_ENTRY) { if (!result.problems.some((p) => /first \d+ rooms/.test(p.reason))) result.problems.push({ text: sizeText, reason: `Only the first ${MAX_ROOMS_PER_ENTRY} rooms were read` }); return; }
    // The words between two sizes can hold more than one name when someone listed a room and forgot its size ("Lounge 4 x 4, hall,
    // Study 3 x 3"). Only ONE part belongs to this size: the last one when names come first, the first one when they come after.
    // The others are rooms with no size: they are reported, never glued on to a neighbour's name.
    const pieces = nameRaw.split(/[,;]+/).map((x) => tidyName(x)).filter((x) => /[A-Za-z]/.test(x));
    const ownAt = after ? 0 : pieces.length - 1;
    pieces.forEach((piece, k) => { if (k !== ownAt) result.problems.push({ text: piece, reason: "No size given for this one" }); });
    let name = pieces[ownAt] ?? "";
    const w = toMetres(m[1], unit, unitWord(m[2])), l = toMetres(m[2], unit, unitWord(m[1]));
    if (w === null || l === null) { result.problems.push({ text: `${name || "?"} ${sizeText}`.trim(), reason: /^\d+$/.test(m[1].trim()) || /^\d+$/.test(m[2].trim()) ? "Add a unit (m, cm, mm or ft) - a bare number like that could mean several things" : "Could not read that size" }); return; }
    const W = Math.round(w * 100) / 100, L = Math.round(l * 100) / 100;
    if (W < MIN_ROOM_M || W > MAX_ROOM_M || L < MIN_ROOM_M || L > MAX_ROOM_M) { result.problems.push({ text: `${name || "?"} ${sizeText}`.trim(), reason: `Sizes must be between ${MIN_ROOM_M} and ${MAX_ROOM_M} metres` }); return; }
    if (!/[A-Za-z]/.test(name)) {
      name = `Room ${result.rooms.length + 1}`;
      result.warnings.push(`A size had no name, so it was called "${name}".`);
    }
    const base = name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base} (${n})`;
    if (name !== base) result.warnings.push(`"${base}" was already used, so this one is called "${name}".`);
    used.add(name.toLowerCase());
    result.rooms.push({ name, widthM: W, lengthM: L, isGarden: OUTDOOR.test(name), isStairs: STAIRS.test(name), sizeText });
    result.warnings.push(...plausibilityWarnings(name, W, L, "written"));
  });
  // words left over after the last size, with no size of their own (name-first lists only)
  if (!after) {
    const tail = text.slice(matches[matches.length - 1].index! + matches[matches.length - 1][0].length).replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, "");
    if (/[A-Za-z]/.test(tail)) result.problems.push({ text: tail.slice(0, 60), reason: "No size given for this one" });
  }
  return result;
}
