// The name a template is STORED under (for example "Inventory: 2-bed apartment (unfurnished)") is
// internal wording: every inventory template carries "(unfurnished)" because that is how they were
// first set up. Anything a client or tenant sees - the report cover, the page header, the file name
// of the PDF - should read as a document title, not a system label, so it is tidied on the way out
// rather than by renaming rows in the database (which the app has no screen for).
//
//   "Inventory: 2-bed apartment (unfurnished)"  ->  "Inventory: 2-bed apartment"
//   "Inventory: Room (HMO, unfurnished)"        ->  "Inventory: Room (HMO)"
//   "Mid Term: 2-bed apartment"                 ->  unchanged
export function cleanTemplateName(name: string): string {
  return name
    .replace(/\s*\(\s*HMO\s*,\s*unfurnished\s*\)/gi, " (HMO)")
    .replace(/\s*\(\s*unfurnished\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
