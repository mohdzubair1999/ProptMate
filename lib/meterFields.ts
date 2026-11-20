// Finds the boxes of a meter-readings section in a template: which text box takes the electricity reading, which the gas reading,
// which the serial number. Templates are built by people, so this goes by what a field IS (its kind) and what it is called, and
// gives up quietly when unsure: a helper that is not shown is better than one that fills the wrong box.

export type MeterField = { id: string; label: string; type: string };
export type MeterType = "electricity" | "gas" | "water";
export type MeterTarget = { reading: string | null; serial: string | null };
export type MeterFields = { photoFieldId: string; targets: Partial<Record<MeterType | "any", MeterTarget>> };

const SECTION = /\b(meters?|utilit(?:y|ies)|readings?)\b/i;
const TYPE_RE: Record<MeterType, RegExp> = { electricity: /\b(electric\w*|elec|power|mpan)\b/i, gas: /\b(gas|mprn)\b/i, water: /\bwater\b/i };
const READING = /\breading\b|\bread\b/i;
const SERIAL = /serial|mpan|mprn|meter (?:no|number)|\bs\/?n\b/i;
const BOX = new Set(["TEXT", "SHORT_TEXT", "NUMBER"]);

export function findMeterFields(sectionTitle: string, fields: MeterField[], photoFieldId: string): MeterFields | null {
  if (!Array.isArray(fields)) return null;
  const photo = fields.find((f) => f?.id === photoFieldId && f.type === "PHOTO");
  if (!photo) return null;
  if (!(SECTION.test(sectionTitle || "") || /meter/i.test(photo.label || ""))) return null;
  // not a keys section that merely mentions "reading"
  if (/\bkeys?\b/i.test(sectionTitle || "") && !/meter|utilit|reading/i.test(sectionTitle || "")) return null;

  const boxes = fields.filter((f) => f && BOX.has(f.type));
  const targets: MeterFields["targets"] = {};
  const typeOf = (label: string): MeterType | null => (["electricity", "gas", "water"] as MeterType[]).find((t) => TYPE_RE[t].test(label)) ?? null;
  for (const t of ["electricity", "gas", "water"] as MeterType[]) {
    const mine = boxes.filter((f) => typeOf(f.label) === t);
    const serial = mine.find((f) => SERIAL.test(f.label)) ?? null;
    const reading = mine.find((f) => READING.test(f.label) && f !== serial) ?? mine.find((f) => f !== serial && !SERIAL.test(f.label)) ?? null;
    if (reading || serial) targets[t] = { reading: reading?.id ?? null, serial: serial?.id ?? null };
  }
  // boxes that name no particular meter: usable only when there is exactly one of each kind, so it can never be the wrong one
  const generic = boxes.filter((f) => typeOf(f.label) === null);
  const gReadings = generic.filter((f) => READING.test(f.label) && !SERIAL.test(f.label)), gSerials = generic.filter((f) => SERIAL.test(f.label));
  if (gReadings.length === 1 || gSerials.length === 1) targets.any = { reading: gReadings.length === 1 ? gReadings[0].id : null, serial: gSerials.length === 1 ? gSerials[0].id : null };
  return Object.values(targets).some((t) => t && (t.reading || t.serial)) ? { photoFieldId, targets } : null;
}

// A section that is clearly about meters, but where no box could be recognised: the reader cannot be offered, and the person is told why
// (instead of the button silently not appearing).
const METER_TITLE = /\b(meters?|utilit(?:y|ies))\b/i;
export function meterSectionHint(sectionTitle: string, fields: MeterField[], photoFieldId: string): string | null {
  if (!Array.isArray(fields) || !METER_TITLE.test(sectionTitle || "")) return null;
  if (!fields.some((f) => f?.id === photoFieldId && f.type === "PHOTO")) return null;
  if (findMeterFields(sectionTitle, fields, photoFieldId)) return null;
  return 'The meter reader isn\'t available here because this section has no box it can fill. Add a box named like "Electric meter reading", "Gas meter reading" or "Water meter reading" (or a single box called "Reading") to the template.';
}

// Which box should a reading of this kind of meter go in? Never guesses: a named meter wins, else the single generic box, else none.
export function targetFor(m: MeterFields, type: MeterType | "unknown"): MeterTarget | null {
  if (!m || typeof m !== "object" || !m.targets) return null;
  const named = type !== "unknown" ? m.targets[type] : undefined;
  if (named && (named.reading || named.serial)) return named;
  return m.targets.any ?? null;
}
