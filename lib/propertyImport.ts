// Turning spreadsheet rows into properties. This is the single source of truth: the same rules run in the browser's preview and again on
// the server before anything is saved. Pure (no database).

export const IMPORT_FIELDS = ["address", "city", "postcode", "bedrooms", "type", "landlordName", "landlordAddress", "notes", "inspectionFrequencyMonths"] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];
export type PropertyValues = { address: string; city: string | null; postcode: string | null; bedrooms: number | null; type: string; landlordName: string | null; landlordAddress: string | null; notes: string | null; inspectionFrequencyMonths: number | null };
export type RowStatus = "ok" | "error" | "duplicate" | "update";
export type Change = { field: string; from: string; to: string };
// `typeGiven`: the sheet actually had a type for this row (a blank one defaults to Flat for a NEW property, but must never overwrite an existing one)
export type RowResult = { row: number; status: RowStatus; values: PropertyValues | null; address: string; problems: string[]; warnings: string[]; typeGiven?: boolean; existingId?: string; changes?: Change[] };
// A property the company already has, as far as an update needs to know it
export type ExistingProperty = { id: string } & PropertyValues;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
// the column names people use, written without capitals, spaces or punctuation
const SYNONYMS: Record<ImportField, string[]> = {
  address: ["address", "propertyaddress", "address1", "addressline1", "street", "streetaddress", "property"],
  city: ["city", "town", "cityortown", "towncity"],
  postcode: ["postcode", "postalcode", "zip", "zipcode", "postzip"],
  bedrooms: ["bedrooms", "bedroom", "beds", "numberofbedrooms", "nobeds", "bed"],
  type: ["type", "propertytype"],
  landlordName: ["landlord", "landlordname", "owner", "ownername"],
  landlordAddress: ["landlordaddress", "owneraddress", "landlordsaddress"],
  notes: ["notes", "note", "comments", "comment"],
  inspectionFrequencyMonths: ["inspectionfrequency", "frequency", "inspectionfrequencymonths", "inspectevery", "inspectionintervalmonths", "reinspectionmonths"],
};
export const TEMPLATE_HEADERS = ["Address", "City", "Postcode", "Bedrooms", "Type", "Landlord name", "Landlord address", "Notes", "Inspection frequency (months)"];
export const TEMPLATE_EXAMPLE = ["12 Example Road", "Hemel Hempstead", "HP1 1AA", "2", "Flat", "A. Landlord", "1 Landlord Street, London", "Key with the neighbour at number 14", "6"];

export function mapHeaders(header: unknown[]): { columns: Partial<Record<ImportField, number>>; ignored: string[] } {
  const columns: Partial<Record<ImportField, number>> = {};
  const ignored: string[] = [];
  (Array.isArray(header) ? header : []).forEach((h, i) => {
    const key = norm(String(h ?? ""));
    const field = key ? (Object.keys(SYNONYMS) as ImportField[]).find((f) => SYNONYMS[f].includes(key)) : undefined;
    if (field && columns[field] === undefined) columns[field] = i;
    else if (String(h ?? "").trim()) ignored.push(String(h).trim());
  });
  return { columns, ignored };
}

const TYPES: Record<string, string> = { flat: "flat", apartment: "flat", maisonette: "flat", house: "house", studio: "studio", room: "room", roomonly: "room", hmo: "hmo", commercial: "commercial" };
export const TYPE_HELP = "Flat, House, Studio, Room only, HMO or Commercial";
// multiline keeps line breaks (notes); everything else is one line, so a line break becomes a space
const text = (v: unknown, max: number, multiline = false): string | null => {
  let t = String(v ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ");
  t = (multiline ? t.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n") : t.replace(/\s+/g, " ")).trim();
  return t === "" ? null : t.length > max ? "TOO_LONG" : t;
};
// a UK postcode written in capitals with the usual space (HP11AA becomes HP1 1AA); anything else is kept as typed, in capitals
const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/;
export function normalisePostcode(v: string): { value: string; looksUk: boolean } {
  const up = v.toUpperCase().replace(/\s+/g, " ").trim();
  if (UK_POSTCODE.test(up)) return { value: up.replace(/\s/g, "").replace(/^(.+)(\d[A-Z]{2})$/, "$1 $2"), looksUk: true };
  return { value: up, looksUk: false };
}
// two rows are the same property if the address and postcode match ignoring capitals, spacing and punctuation
export const propertyKey = (address: string, postcode: string | null | undefined) => `${norm(address)}|${norm(postcode ?? "")}`;

export function validateRow(cells: unknown[], columns: Partial<Record<ImportField, number>>, rowNumber: number): RowResult {
  const get = (f: ImportField) => (columns[f] === undefined ? undefined : cells[columns[f]!]);
  const problems: string[] = [], warnings: string[] = [];
  const t = (f: ImportField, max: number, label: string): string | null => { const v = text(get(f), max, f === "notes"); if (v === "TOO_LONG") { problems.push(`${label} is too long (over ${max} characters)`); return null; } return v; };
  const address = t("address", 200, "Address");
  if (!address && !problems.length) problems.push("Address is missing");
  const city = t("city", 100, "City");
  let postcode: string | null = null;
  const pcRaw = t("postcode", 20, "Postcode");
  if (pcRaw) { const p = normalisePostcode(pcRaw); postcode = p.value; if (!p.looksUk) warnings.push("The postcode doesn't look like a UK postcode (kept as written)"); }
  let bedrooms: number | null = null;
  const bedRaw = t("bedrooms", 10, "Bedrooms");
  if (bedRaw) { if (/^\d{1,2}(\.0+)?$/.test(bedRaw) && parseInt(bedRaw, 10) <= 50) bedrooms = parseInt(bedRaw, 10); else problems.push("Bedrooms must be a whole number from 0 to 50"); }
  let type = "flat";
  const typeRaw = t("type", 40, "Type");
  if (typeRaw) { const m = TYPES[norm(typeRaw)]; if (m) type = m; else problems.push(`Type "${typeRaw.slice(0, 30)}" isn't recognised. Use ${TYPE_HELP}`); } else warnings.push("No type given: set as Flat");
  const landlordName = t("landlordName", 150, "Landlord name"), landlordAddress = t("landlordAddress", 250, "Landlord address"), notes = t("notes", 2000, "Notes");
  let freq: number | null = null;
  const freqRaw = t("inspectionFrequencyMonths", 30, "Inspection frequency");
  if (freqRaw) { const m = /^(?:every\s+)?(\d{1,3})(?:\s*months?)?$/i.exec(freqRaw); const n = m ? parseInt(m[1], 10) : NaN; if (n >= 1 && n <= 120) freq = n; else problems.push("Inspection frequency must be a number of months from 1 to 120"); }
  if (problems.length > 0 || !address) return { row: rowNumber, status: "error", values: null, address: address ?? "", problems, warnings };
  return { row: rowNumber, status: "ok", values: { address, city, postcode, bedrooms, type, landlordName, landlordAddress, notes, inspectionFrequencyMonths: freq }, address, problems, warnings, typeGiven: !!typeRaw };
}

// What a row would change on a property that already exists. ONLY cells that have something in them count, so an empty cell never blanks out
// a value already there, and a row with no type never resets the type. Capitals and spacing alone are not a change.
const LABELS: Record<string, string> = { city: "City", bedrooms: "Bedrooms", type: "Type", landlordName: "Landlord name", landlordAddress: "Landlord address", notes: "Notes", inspectionFrequencyMonths: "Inspection frequency (months)" };
const shown = (v: unknown) => (v === null || v === undefined || v === "" ? "(empty)" : String(v));
const same = (a: unknown, b: unknown) => (typeof a === "string" || typeof b === "string" ? String(a ?? "").replace(/\s+/g, " ").trim().toLowerCase() === String(b ?? "").replace(/\s+/g, " ").trim().toLowerCase() : (a ?? null) === (b ?? null));
export function diffProperty(current: PropertyValues, incoming: PropertyValues, typeGiven: boolean): Change[] {
  const out: Change[] = [];
  for (const f of ["city", "bedrooms", "type", "landlordName", "landlordAddress", "notes", "inspectionFrequencyMonths"] as const) {
    const to = incoming[f];
    if (to === null || to === undefined || to === "") continue; // an empty cell changes nothing
    if (f === "type" && !typeGiven) continue;
    if (!same(current[f], to)) out.push({ field: LABELS[f], from: shown(current[f]), to: shown(to) });
  }
  return out;
}
// the values to save for an update: only the fields that changed
export function updateData(current: PropertyValues, incoming: PropertyValues, typeGiven: boolean): Partial<PropertyValues> {
  const data: Record<string, unknown> = {};
  for (const f of ["city", "bedrooms", "type", "landlordName", "landlordAddress", "notes", "inspectionFrequencyMonths"] as const) {
    const to = incoming[f];
    if (to === null || to === undefined || to === "" || (f === "type" && !typeGiven)) continue;
    if (!same(current[f], to)) data[f] = to;
  }
  return data as Partial<PropertyValues>;
}

export const MAX_ROWS = 500;
// the whole sheet: the header row and the data rows. `existing` holds the keys of properties the company already has.
export function validateSheet(sheet: unknown, existingIn: Set<string> | Map<string, ExistingProperty>, opts: { updateExisting?: boolean } = {}): { rows: RowResult[]; missingAddress: boolean; ignored: string[]; summary: { total: number; ok: number; errors: number; duplicates: number; updates: number } } {
  const existing = existingIn instanceof Map ? existingIn : new Map<string, ExistingProperty | null>([...existingIn].map((k) => [k, null]));
  // keep every row where it is (a non-list entry becomes an empty row), so row numbers are the spreadsheet's own
  const grid: unknown[][] = Array.isArray(sheet) ? sheet.map((r) => (Array.isArray(r) ? r : [])) : [];
  const isBlank = (r: unknown[]) => r.every((c) => String(c ?? "").trim() === "");
  const headerAt = grid.findIndex((r) => !isBlank(r)); // the first row with anything in it names the columns
  const { columns, ignored } = mapHeaders(headerAt >= 0 ? grid[headerAt] : []);
  const none = { total: 0, ok: 0, errors: 0, duplicates: 0, updates: 0 };
  if (columns.address === undefined) return { rows: [], missingAddress: true, ignored, summary: none };
  const seen = new Map<string, number>();
  const rows: RowResult[] = [];
  for (let i = headerAt + 1; i < grid.length && rows.length < MAX_ROWS; i++) {
    if (grid[i].every((c) => String(c ?? "").trim() === "")) continue; // a blank row is not a property and not a mistake
    const r = validateRow(grid[i], columns, i + 1); // the spreadsheet's own row number (row 1 is the first row of the file)
    if (r.status === "ok" && r.values) {
      const k = propertyKey(r.values.address, r.values.postcode);
      if (existing.has(k)) {
        const cur = existing.get(k);
        const changes = opts.updateExisting && cur ? diffProperty(cur, r.values, !!r.typeGiven) : [];
        if (opts.updateExisting && cur && changes.length > 0 && !seen.has(k)) { r.status = "update"; r.existingId = cur.id; r.changes = changes; r.problems = []; seen.set(k, r.row); }
        else { r.status = "duplicate"; r.problems = [opts.updateExisting && cur && !seen.has(k) ? "Already in your properties, and nothing in this row is different" : seen.has(k) ? `Same address and postcode as row ${seen.get(k)}` : "Already in your properties (same address and postcode)"]; }
      }
      else if (seen.has(k)) { r.status = "duplicate"; r.problems = [`Same address and postcode as row ${seen.get(k)}`]; }
      else seen.set(k, r.row);
    }
    rows.push(r);
  }
  return { rows, missingAddress: false, ignored, summary: { total: rows.length, ok: rows.filter((r) => r.status === "ok").length, errors: rows.filter((r) => r.status === "error").length, duplicates: rows.filter((r) => r.status === "duplicate").length, updates: rows.filter((r) => r.status === "update").length } };
}
