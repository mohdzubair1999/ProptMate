// The name a template is STORED under (for example "Inventory: 2-bed apartment (unfurnished)") is
// internal wording: every inventory template carries "(unfurnished)" because that is how they were
// first set up. Anything a client or tenant sees - the report cover, the page header, the file name
// of the PDF - should read as a document title, not a system label, so it is tidied on the way out
// rather than by renaming rows in the database (which the app has no screen for).
//
//   "Inventory: 2-bed apartment (unfurnished)"  ->  "Inventory: 2-bed flat"
//   "Inventory: Room (HMO, unfurnished)"        ->  "Inventory: Room (HMO)"
//   "Mid Term: 2-bed apartment"                 ->  unchanged
//
// Inventories and Mid Term inspections also say "flat", never "apartment", to match the property type printed on
// the cover, and are written as a title: "Inventory: 2-Bed Flat", "Mid Term: 5-Bed House". That is deliberately
// narrow: only "<n>-bed <flat|house|bungalow|maisonette|apartment>" and "studio <flat|apartment>" in a title that
// starts "Inventory:" or "Mid Term:" - not every use of those words, so a template that is really about something
// else is left alone.
export function cleanTemplateName(name: string): string {
  let out = name
    .replace(/\s*\(\s*HMO\s*,\s*unfurnished\s*\)/gi, " (HMO)")
    .replace(/\s*\(\s*unfurnished\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (/^\s*(inventory|mid[\s-]?term)\s*:/i.test(out)) {
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    out = out
      .replace(/\b(\d+)([-\s])(bed|bedroom)\s+(apartment|flat|house|bungalow|maisonette)\b/gi, (_m, n: string, sep: string, bed: string, kind: string) => `${n}${sep}${cap(bed)} ${/^apartment$/i.test(kind) ? "Flat" : cap(kind)}`)
      .replace(/\bstudio\s+(apartment|flat)\b/gi, () => "Studio Flat");
  }
  return out;
}

// The title a REPORT carries. Inventory templates are used for both the check-in and the check-out, so a check-out
// report built from "Inventory: 1-Bed Flat" must read "Check Out: 1-Bed Flat". Anything else is just the clean name.
export function reportTitle(templateName: string, inspectionType?: string | null): string {
  const name = cleanTemplateName(templateName);
  if (inspectionType === "check-out") {
    // "Inventory: 1-Bed Flat" -> "Check Out: 1-Bed Flat"; a template called just "Inventory" -> "Check Out".
    const m = name.match(/^\s*inventory\s*(?::\s*(.*))?$/i);
    if (m) return m[1] ? `Check Out: ${m[1]}` : "Check Out";
  }
  return name;
}
