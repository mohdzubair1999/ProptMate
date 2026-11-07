// Finds the parts of a damp and mould section of a mid-term template: the Yes/No "any signs?" question, the Severity dropdown,
// the "Location(s) and extent" text and the Photos field. Templates are built by people and can be renamed or extended, so this
// goes by what a field IS (its kind and its options) as well as what it is called, and gives up quietly when unsure: an
// assistant that is not shown is better than one that fills in the wrong box.

export type HazardField = { id: string; label: string; type: string; options: string | null };
export type HazardFields = {
  photoFieldId: string;
  signsFieldId: string | null;
  severityFieldId: string | null;
  locationFieldId: string | null;
  severityOptions: string[];
  signsOptions: string[];
};

const SECTION = /damp|mould|mold/i;
const SEVERITY_WORDS = /urgent|within \d+ ?days?|monitor|no concern|emergency|immediate/i;

export function parseOptions(raw: string | null | undefined): string[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((o): o is string => typeof o === "string" && o.trim().length > 0 && o.length <= 120).slice(0, 12) : [];
  } catch {
    return [];
  }
}

export function findHazardFields(sectionTitle: string, fields: HazardField[], photoFieldId: string): HazardFields | null {
  if (typeof sectionTitle !== "string" || !SECTION.test(sectionTitle) || !Array.isArray(fields)) return null;
  const photos = fields.filter((f) => f?.type === "PHOTO");
  if (!photos.some((f) => f.id === photoFieldId)) return null;
  const dropdowns = fields.filter((f) => f?.type === "DROPDOWN").map((f) => ({ f, options: parseOptions(f.options) }));

  const isSeverity = (d: { f: HazardField; options: string[] }) => /severity/i.test(d.f.label) || d.options.filter((o) => SEVERITY_WORDS.test(o)).length >= 2;
  const severity = dropdowns.find((d) => /severity/i.test(d.f.label) && d.options.length >= 2) ?? dropdowns.find((d) => isSeverity(d) && d.options.length >= 2) ?? null;

  const yesNo = (d: { options: string[] }) => d.options.length === 2 && new Set(d.options.map((o) => o.trim().toLowerCase())).size === 2 && d.options.every((o) => /^(yes|no)$/i.test(o.trim()));
  const others = dropdowns.filter((d) => d !== severity && yesNo(d));
  // the question about signs of damp or mould, not (for example) a condensation or ventilation question
  const signs = others.find((d) => /damp|mou?ld|sign/i.test(d.f.label)) ?? others.find((d) => !/condensation|extractor|fan|ventilat/i.test(d.f.label)) ?? null;

  const texts = fields.filter((f) => f?.type === "TEXT");
  const location = texts.find((f) => /location|extent/i.test(f.label)) ?? texts.find((f) => /where|notes?|comment/i.test(f.label) && !/^comments$/i.test(f.label.trim())) ?? null;

  if (!severity && !location) return null;
  return {
    photoFieldId,
    signsFieldId: signs?.f.id ?? null,
    severityFieldId: severity?.f.id ?? null,
    locationFieldId: location?.id ?? null,
    severityOptions: severity?.options ?? [],
    signsOptions: signs?.options ?? [],
  };
}
