import type { PickerOption } from "./searchSelect";

// Turns the company's properties into the choices of a searchable property picker: the address is the name, the city and postcode are the small second line, and the
// landlord, the type, the city and the postcode are extra words that find it (so typing a landlord's name, or a postcode, finds the property).
export type PickerProperty = { id: string; address: string; city?: string | null; postcode?: string | null; landlordName?: string | null; type?: string | null };

const clean = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");

export function propertyOptions(list: unknown): PickerOption[] {
  if (!Array.isArray(list)) return [];
  const out: PickerOption[] = [];
  for (const p of list as PickerProperty[]) {
    if (!p || typeof p !== "object" || typeof p.id !== "string" || !p.id) continue;
    const address = clean(p.address);
    if (!address) continue;
    const city = clean(p.city), postcode = clean(p.postcode), landlord = clean(p.landlordName), type = clean(p.type);
    const hint = [city, postcode].filter(Boolean).join(" · ");
    out.push({ value: p.id, label: address, ...(hint ? { hint } : {}), keywords: [city, postcode, landlord, type].filter(Boolean) });
  }
  return out;
}
