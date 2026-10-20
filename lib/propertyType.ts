// How a property's type is written for people to read.
//
// The type is stored as a short lowercase code (studio, room, flat, house, hmo, commercial). Showing that code
// as it is puts "flat" with a small f on the cover of a report, and the CSS "capitalize" the lists used turns
// "hmo" into "Hmo". This is the one place that turns the code into proper wording, so every report, page and
// dropdown reads the same.
const LABELS: Record<string, string> = {
  studio: "Studio",
  room: "Room only",
  flat: "Flat",
  house: "House",
  hmo: "HMO",
  commercial: "Commercial",
  any: "Any property type",
};

export function formatPropertyType(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const known = LABELS[raw.toLowerCase()];
  if (known) return known;
  // A type this list doesn't know (added later, or typed in by hand): keep the words, just start with a capital.
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// The property type to show in brackets after a template's name in a dropdown - but ONLY when the name does not
// already say it. "Inventory: 1-Bed Flat" needs no "(Flat)", "HMO checklist" needs no "(HMO)", and "Inventory: Room
// (HMO)" must not become "Inventory: Room (HMO) (Room only)". A template whose name says nothing about the type
// (say "Check-out report", for flats) still gets "(Flat)", so you can tell them apart. Templates for any type get
// nothing. Returns "" or the text including its brackets.
export function typeSuffix(templateName: string, propertyType: string | null | undefined): string {
  const code = (propertyType ?? "").trim().toLowerCase();
  if (!code || code === "any") return "";
  const label = formatPropertyType(code);
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const alreadySaid = [code, label.toLowerCase()].some((w) => new RegExp(`\\b${esc(w)}s?\\b`, "i").test(templateName));
  return alreadySaid ? "" : `(${label})`;
}
