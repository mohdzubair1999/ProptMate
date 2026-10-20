// Everything that happens AFTER the AI has read a hand-drawn sketch and BEFORE the rooms reach the plan editor.
//
// The AI is good at reading a layout and copying numbers it can see. It is not good at arithmetic or at knowing a real
// scale that was never written down. So the work is split: the AI copies the measurements exactly as written, and this
// file - plain, tested code - converts them, checks them, labels every room's size as "written" or "estimated", and
// lets a person pin the whole plan to one real measurement.
//
// Pure functions only (no network, no browser), so every rule here is covered by tests.

export type Unit = "m" | "ft" | "mm" | "cm" | "unknown";
export type SizeSource = "written" | "unverified" | "estimated" | "calibrated";

export const MAX_ROOM_M = 30; // the plan editor's own limit
export const MIN_ROOM_M = 0.3;
const round2 = (n: number) => Math.round(n * 100) / 100;
const ok = (m: number) => Number.isFinite(m) && m >= MIN_ROOM_M && m <= MAX_ROOM_M;

// ---- reading a written measurement --------------------------------------------------------------------------------

// "3.5m", "3,5 m", "3500mm", "350cm", "12ft", "12'6\"", "12 ft 6 in", "12-6" (feet and inches, when the sketch is in
// feet), "3m50". Returns metres, or null when the text is not a clear measurement - never a guess. A bare number such
// as "3.5" is only read if the sketch's unit is known.
export function parseDimensionText(input: unknown, defaultUnit: Unit = "unknown"): number | null {
  if (typeof input === "number") return toMetres(input, defaultUnit);
  if (typeof input !== "string") return null;
  let t = input
    .toLowerCase()
    .replace(/[\u2032\u2019\u2018`]/g, "'") // prime marks and curly quotes for feet
    .replace(/[\u2033\u201d\u201c]/g, '"') // double prime and curly quotes for inches
    .replace(/\u00b4/g, "'")
    .replace(/^(?:approx\.?|approximately|about|circa|c\.|~)\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t || t.length > 24) return null;
  // thousands separator on a millimetre figure ("3,500mm") versus a decimal comma ("3,5m")
  if (/^\d{1,2},\d{3}\s*mm$/.test(t)) t = t.replace(",", "");
  else t = t.replace(/(\d),(\d)/g, "$1.$2");

  let m: RegExpMatchArray | null;
  // feet and inches: 12'6"  12' 6"  12ft 6in  12 feet 6 inches  12'  12ft
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|foot)\s*(?:-\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|in|ins|inch|inches)?)?$/))) {
    const inches = m[2] ? parseFloat(m[2]) : 0;
    if (inches >= 12) return null; // 12'14" is a misreading, not a measurement
    return finish(parseFloat(m[1]) * 0.3048 + inches * 0.0254);
  }
  // inches only: 90"  90in
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*(?:"|in|ins|inch|inches)$/))) return finish(parseFloat(m[1]) * 0.0254);
  // metres and centimetres written together: 3m50  3m 50cm  3m 5
  if ((m = t.match(/^(\d+)\s*m\s*(\d{1,3})\s*(?:cm)?$/))) return finish(parseInt(m[1], 10) + parseInt(m[2], 10) / 100);
  // metres
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*(?:m|mtr|mtrs|metre|metres|meter|meters)$/))) return finish(parseFloat(m[1]));
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*cm$/))) return finish(parseFloat(m[1]) / 100);
  if ((m = t.match(/^(\d+(?:\.\d+)?)\s*mm$/))) return finish(parseFloat(m[1]) / 1000);
  // feet-and-inches shorthand "12-6" or "12.6", but only when the sketch is in feet
  if (defaultUnit === "ft" && (m = t.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/))) {
    if (parseInt(m[2], 10) >= 12) return null;
    return finish(parseInt(m[1], 10) * 0.3048 + parseInt(m[2], 10) * 0.0254);
  }
  // a bare number: only with a known unit
  if ((m = t.match(/^(\d+(?:\.\d+)?)$/))) return toMetres(parseFloat(m[1]), defaultUnit);
  return null;
}

function toMetres(n: number, unit: Unit): number | null {
  if (!Number.isFinite(n)) return null;
  if (unit === "m") return finish(n);
  if (unit === "ft") return finish(n * 0.3048);
  if (unit === "cm") return finish(n / 100);
  if (unit === "mm") return finish(n / 1000);
  return null;
}
const finish = (m: number): number | null => (ok(m) ? round2(m) : null);

// "12'6\" x 10'2\"", "3.5m by 4.2m", "3500 x 4200" -> [width, length] in metres, or null unless BOTH sides read.
export function parseSizePair(input: unknown, defaultUnit: Unit = "unknown"): [number, number] | null {
  if (typeof input !== "string") return null;
  const parts = input.split(/\s*(?:x|\u00d7|\*|\bby\b)\s*/i);
  if (parts.length !== 2) return null;
  // "3500 x 4200" with no unit on either side: each side inherits the other's unit when only one has one
  const unitOf = (s: string) => (/mm|cm|ft|feet|foot|'|"|in\b|inch|m\b|metre|meter/i.test(s) ? s.replace(/[\d.,\s]/g, "") : "");
  let [a, b] = parts;
  if (!unitOf(a) && unitOf(b) && /^[\d.,\s]+$/.test(a)) a = `${a.trim()}${unitOf(b)}`;
  const w = parseDimensionText(a, defaultUnit), l = parseDimensionText(b, defaultUnit);
  return w !== null && l !== null ? [w, l] : null;
}

// ---- reading the model's reply -------------------------------------------------------------------------------------

// The reply should be a bare JSON object, but models sometimes wrap it in ```json fences or add a sentence before or
// after it. Pulls out the first complete {...} instead of failing the whole upload.
export function extractJson(text: unknown): any | null {
  if (typeof text !== "string") return null;
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    const v = JSON.parse(cleaned);
    return v && typeof v === "object" ? v : null;
  } catch {
    /* fall through to scanning */
  }
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const c = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) {
      try {
        const v = JSON.parse(cleaned.slice(start, i + 1));
        return v && typeof v === "object" ? v : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---- cleaning the rooms --------------------------------------------------------------------------------------------

export type SketchRoom = Record<string, any> & { name: string; widthM: number; lengthM: number; sizeSource: SizeSource };
export type CleanResult = {
  rooms: SketchRoom[];
  warnings: string[];
  unit: Unit;
  dimensionsFromSketch: boolean;
  counts: { written: number; unverified: number; estimated: number };
};

const UNITS: Unit[] = ["m", "ft", "mm", "cm", "unknown"];
const SHAPE_NUMBER_FIELDS = ["bayWidthM", "bayDepthM", "notchWidthM", "notchDepthM", "angledCutWidthM", "angledCutDepthM", "trapezoidTopWidthM", "slopedTopAmountM"];

// Takes whatever the model returned and produces rooms that are safe to put on a plan, each labelled with where its
// size came from. Rooms are never silently dropped: one whose size cannot be read is kept (at a neutral 3 m x 3 m)
// and flagged, so the person sees it and fixes it instead of wondering where it went.
export function cleanSketchRooms(parsed: any): CleanResult {
  const warnings: string[] = [];
  const unit: Unit = UNITS.includes(parsed?.unit) ? parsed.unit : "unknown";
  const raw: any[] = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
  const rooms: SketchRoom[] = [];
  const names = new Set<string>();

  raw.forEach((r, idx) => {
    if (!r || typeof r !== "object") return;
    let name = typeof r.name === "string" ? r.name.replace(/\s+/g, " ").trim().slice(0, 60) : "";
    if (!name) {
      name = `Room ${idx + 1}`;
      warnings.push(`A room had no name, so it was called "${name}".`);
    }
    while (names.has(name.toLowerCase())) name = `${name} (2)`; // two identical names would confuse door links
    names.add(name.toLowerCase());

    // 1. the measurements as written, converted here in code
    let wRead = parseDimensionText(r.widthText, unit), lRead = parseDimensionText(r.lengthText, unit);
    if ((wRead === null || lRead === null) && typeof r.sizeText === "string") {
      const pair = parseSizePair(r.sizeText, unit);
      if (pair) [wRead, lRead] = wRead === null || lRead === null ? pair : [wRead, lRead];
    }
    // 2. the model's own numbers (estimates, or its conversion of what it read)
    const wModel = typeof r.widthM === "number" && ok(r.widthM) ? round2(r.widthM) : null;
    const lModel = typeof r.lengthM === "number" && ok(r.lengthM) ? round2(r.lengthM) : null;

    let widthM: number, lengthM: number, source: SizeSource;
    if (wRead !== null && lRead !== null) {
      widthM = wRead;
      lengthM = lRead;
      source = "written";
    } else if (wRead !== null || lRead !== null) {
      widthM = wRead ?? wModel ?? 3;
      lengthM = lRead ?? lModel ?? 3;
      source = "unverified";
      warnings.push(`Only one side of "${name}" had a readable measurement; the other side is an estimate.`);
    } else if (wModel !== null && lModel !== null) {
      widthM = wModel;
      lengthM = lModel;
      // the model says it read the sizes but gave no text to check them against
      source = r.sizeSource === "written" ? "unverified" : "estimated";
    } else {
      widthM = wModel ?? 3;
      lengthM = lModel ?? 3;
      source = "estimated";
      warnings.push(`The size of "${name}" could not be read, so it was set to ${widthM} m x ${lengthM} m. Please correct it.`);
    }

    const room: SketchRoom = { ...r, name, widthM, lengthM, sizeSource: source };
    delete room.widthText;
    delete room.lengthText;
    delete room.sizeText;
    for (const f of SHAPE_NUMBER_FIELDS) {
      if (room[f] !== null && room[f] !== undefined && !(typeof room[f] === "number" && Number.isFinite(room[f]) && room[f] > 0 && room[f] <= MAX_ROOM_M)) room[f] = null;
    }
    rooms.push(room);
  });

  // door links may only point at rooms that exist, and never at themselves
  const have = new Map(rooms.map((r) => [r.name.toLowerCase(), r.name]));
  for (const r of rooms) {
    r.connectsTo = Array.isArray(r.connectsTo)
      ? [...new Set<string>(r.connectsTo.map((n: unknown) => (typeof n === "string" ? have.get(n.toLowerCase().trim()) : undefined)).filter((n: string | undefined): n is string => !!n && n !== r.name))]
      : [];
  }

  for (const r of rooms) warnings.push(...plausibilityWarnings(r.name, r.widthM, r.lengthM, r.sizeSource));
  const total = rooms.reduce((s, r) => s + r.widthM * r.lengthM, 0);
  if (rooms.length > 0 && (total < 8 || total > 400)) warnings.push(`The rooms add up to ${Math.round(total)} m\u00b2, which is unusual for a home - check the sizes.`);

  const counts = {
    written: rooms.filter((r) => r.sizeSource === "written").length,
    unverified: rooms.filter((r) => r.sizeSource === "unverified").length,
    estimated: rooms.filter((r) => r.sizeSource === "estimated").length,
  };
  return { rooms, warnings, unit, dimensionsFromSketch: rooms.length > 0 && counts.written === rooms.length, counts };
}

// ---- does this size make sense for this kind of room? --------------------------------------------------------------

type Kind = "bathroom" | "bedroom" | "living" | "kitchen" | "hall" | "garage";
const KINDS: [Kind, RegExp][] = [
  ["bathroom", /\b(bath|shower|wc|toilet|cloak|en-?suite|ensuite|wet room|utility)\w*/i],
  ["kitchen", /\b(kitchen|diner|dining)\w*/i],
  ["living", /\b(living|lounge|sitting|reception|family|front room|drawing)\w*/i],
  ["bedroom", /\b(bed|master|nursery|guest)\w*/i],
  ["hall", /\b(hall|landing|corridor|porch|lobby|entrance|stair)\w*/i],
  ["garage", /\bgarage\w*/i],
];
// [min of the short side, max of the long side, min area, max area] in metres - generous, for ordinary UK homes
const RANGES: Record<Kind, [number, number, number, number]> = {
  bathroom: [0.8, 4.5, 1, 12],
  bedroom: [1.8, 7, 5, 35],
  living: [2.2, 9, 8, 60],
  kitchen: [1.6, 8, 4, 45],
  hall: [0.7, 14, 1.5, 30],
  garage: [2.2, 9, 10, 45],
};

export function plausibilityWarnings(name: string, w: number, l: number, source: SizeSource): string[] {
  const kind = KINDS.find(([, re]) => re.test(name))?.[0];
  if (!kind) return [];
  const [minShort, maxLong, minArea, maxArea] = RANGES[kind];
  const short = Math.min(w, l), long = Math.max(w, l), area = w * l;
  if (short < minShort || long > maxLong || area < minArea || area > maxArea) {
    const how = source === "written" ? "Check the measurement was read correctly." : "It is an estimate, so check it.";
    return [`"${name}" comes out at ${w} m x ${l} m, which is unusual for a ${kind === "living" ? "living room" : kind}. ${how}`];
  }
  return [];
}

// ---- pinning the plan to one real measurement ----------------------------------------------------------------------

const LINEAR_FIELDS = ["widthM", "lengthM", "bayWidthM", "bayDepthM", "notchWidthM", "notchDepthM", "angledCutWidthM", "angledCutDepthM", "trapezoidTopWidthM", "slopedTopAmountM"] as const;
export type CalibratableRoom = { name: string; widthM: string; lengthM: string; xM?: number; yM?: number; [k: string]: any };
export type Calibration = { index: number; dimension: "width" | "length"; valueM: number; includeWritten?: boolean };

// One true measurement fixes the scale of a whole sketch: if the lounge is really 4.5 m wide and the plan has it at
// 3.8 m, every ESTIMATED room is scaled by 4.5 / 3.8. Rooms whose sizes were read from the person's own writing are left
// alone unless asked for. Walls, bays and notches scale with their room, and a plan that is already positioned keeps
// its layout. The room the person measured is set to exactly the value they typed.
export function calibrateRooms(
  rooms: CalibratableRoom[],
  sources: Record<string, SizeSource | undefined>,
  cal: Calibration
): { rooms: CalibratableRoom[]; scaled: number; factor: number } | { error: string } {
  const ref = rooms[cal.index];
  if (!ref) return { error: "Choose a room first." };
  const current = parseFloat(cal.dimension === "width" ? ref.widthM : ref.lengthM);
  if (!Number.isFinite(current) || current <= 0) return { error: `That room has no ${cal.dimension} yet.` };
  if (!Number.isFinite(cal.valueM) || cal.valueM < MIN_ROOM_M || cal.valueM > MAX_ROOM_M) return { error: `Enter a measurement between ${MIN_ROOM_M} and ${MAX_ROOM_M} metres.` };
  const factor = cal.valueM / current;
  if (factor < 0.2 || factor > 5) return { error: `That would change the sizes by more than five times (x${round2(factor)}). Check the number you typed.` };

  let scaled = 0;
  const out = rooms.map((room, i) => {
    const src = sources[room.name];
    // the measured room always; estimated and partly-read rooms; rooms read from the sketch only if asked
    const inScope = i === cal.index || !!cal.includeWritten || src !== "written";
    if (!inScope) return room;
    const next: CalibratableRoom = { ...room };
    for (const f of LINEAR_FIELDS) {
      const v = parseFloat(next[f] as any);
      if (next[f] !== undefined && next[f] !== null && next[f] !== "" && Number.isFinite(v)) next[f] = String(round2(v * factor));
    }
    if (typeof next.xM === "number") next.xM = round2(next.xM * factor);
    if (typeof next.yM === "number") next.yM = round2(next.yM * factor);
    // everything else measured in metres inside the room moves with it, so a door stays on the same part of its wall
    const mul = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? round2(n * factor) : n);
    const scaleKeys = (o: any, keys: string[]) => {
      if (!o || typeof o !== "object") return o;
      const c = { ...o };
      for (const k of keys) if (typeof c[k] === "number") c[k] = mul(c[k]);
      return c;
    };
    if (Array.isArray(next.customPoints)) next.customPoints = next.customPoints.map((pt: unknown) => (Array.isArray(pt) ? pt.map(mul) : pt));
    if (Array.isArray(next.customWalls)) next.customWalls = next.customWalls.map((w: any) => scaleKeys(w, ["zigzagDepthM", "alcoveOffsetM", "alcoveWidthM", "alcoveDepthM"]));
    if (Array.isArray(next.fixturePositions)) next.fixturePositions = next.fixturePositions.map((f: any) => scaleKeys(f, ["xM", "yM"]));
    if (Array.isArray(next.exteriorDoors)) next.exteriorDoors = next.exteriorDoors.map((d: any) => scaleKeys(d, ["positionM"]));
    if (Array.isArray(next.windows)) next.windows = next.windows.map((w: any) => scaleKeys(w, ["positionM"]));
    if (i === cal.index) next[cal.dimension === "width" ? "widthM" : "lengthM"] = String(round2(cal.valueM));
    scaled++;
    return next;
  });
  for (const r of out) {
    if (parseFloat(r.widthM) > MAX_ROOM_M || parseFloat(r.lengthM) > MAX_ROOM_M) return { error: `"${r.name}" would be over ${MAX_ROOM_M} m. Check the measurement you typed.` };
  }
  return { rooms: out, scaled, factor: round2(factor) };
}
