// "Start from a typical layout": a sensible set of rooms for a common kind of home, so a plan starts with something to adjust
// instead of a blank page. The sizes are TYPICAL, not measured. They are always shown as estimates, and the person is asked
// for one real measurement to scale the lot (the same tool used after reading a sketch).

export type TemplateRoom = { name: string; widthM: number; lengthM: number; outdoor?: boolean };
export type PlanTemplate = { id: string; label: string; floors: { name: string; rooms: TemplateRoom[] }[] };

const R = (name: string, widthM: number, lengthM: number, outdoor = false): TemplateRoom => (outdoor ? { name, widthM, lengthM, outdoor } : { name, widthM, lengthM });

export const PLAN_TEMPLATES: PlanTemplate[] = [
  { id: "studio", label: "Studio", floors: [{ name: "Ground floor", rooms: [R("Living/Sleeping area", 4.6, 3.8), R("Kitchen area", 2.4, 2.0), R("Bathroom", 2.0, 1.9), R("Hall", 1.2, 2.0)] }] },
  { id: "flat-1", label: "1-bed flat", floors: [{ name: "Ground floor", rooms: [R("Lounge", 4.2, 3.6), R("Kitchen", 3.0, 2.4), R("Bedroom 1", 3.8, 3.2), R("Bathroom", 2.1, 1.9), R("Hall", 1.2, 3.2)] }] },
  { id: "flat-2", label: "2-bed flat", floors: [{ name: "Ground floor", rooms: [R("Lounge", 4.5, 3.8), R("Kitchen", 3.2, 2.6), R("Bedroom 1", 3.8, 3.2), R("Bedroom 2", 3.0, 2.6), R("Bathroom", 2.2, 1.9), R("Hall", 1.2, 3.6)] }] },
  { id: "house-2", label: "2-bed house", floors: [
    { name: "Ground floor", rooms: [R("Lounge", 4.2, 3.6), R("Kitchen/Diner", 4.4, 3.0), R("Hall", 1.0, 3.5), R("Garden", 8.0, 5.0, true)] },
    { name: "First floor", rooms: [R("Bedroom 1", 3.8, 3.4), R("Bedroom 2", 3.0, 2.8), R("Bathroom", 2.1, 1.9), R("Landing", 2.0, 1.0)] },
  ] },
  { id: "house-3", label: "3-bed house", floors: [
    { name: "Ground floor", rooms: [R("Lounge", 4.5, 3.8), R("Dining room", 3.2, 3.0), R("Kitchen", 3.6, 2.8), R("Hall", 1.0, 3.6), R("WC", 1.6, 1.0), R("Garden", 10.0, 6.0, true)] },
    { name: "First floor", rooms: [R("Bedroom 1", 4.0, 3.4), R("Bedroom 2", 3.4, 3.0), R("Bedroom 3", 2.5, 2.3), R("Bathroom", 2.2, 2.0), R("Landing", 2.4, 1.2)] },
  ] },
  { id: "house-4", label: "4-bed house", floors: [
    { name: "Ground floor", rooms: [R("Lounge", 4.8, 4.0), R("Dining room", 3.5, 3.2), R("Kitchen", 3.8, 3.0), R("Utility", 2.0, 1.6), R("Hall", 1.2, 4.0), R("Garden", 12.0, 7.0, true)] },
    { name: "First floor", rooms: [R("Bedroom 1", 4.2, 3.6), R("Bedroom 2", 3.6, 3.2), R("Bedroom 3", 3.0, 2.8), R("Bedroom 4", 2.6, 2.4), R("Bathroom", 2.4, 2.1), R("Landing", 3.0, 1.2)] },
  ] },
  { id: "hmo-5", label: "5-bed HMO", floors: [
    { name: "Ground floor", rooms: [R("Lounge", 4.5, 3.6), R("Kitchen", 4.0, 3.2), R("Bedroom 1", 3.6, 3.0), R("Bathroom", 2.2, 1.9), R("Hall", 1.2, 3.6), R("Garden", 8.0, 5.0, true)] },
    { name: "First floor", rooms: [R("Bedroom 2", 3.8, 3.2), R("Bedroom 3", 3.4, 3.0), R("Bedroom 4", 3.2, 2.8), R("Bedroom 5", 3.0, 2.6), R("Shared bathroom", 2.3, 2.0), R("Landing", 2.4, 1.2)] },
  ] },
];

export const templateById = (id: string) => PLAN_TEMPLATES.find((t) => t.id === id) ?? null;

// Which layout to suggest for a property record. Returns null whenever it is not clear: a wrong suggestion is worse than none.
export function suggestTemplate(type: string | null | undefined, bedrooms: number | null | undefined): string | null {
  const t = (type ?? "").trim().toLowerCase(), beds = typeof bedrooms === "number" && Number.isInteger(bedrooms) && bedrooms >= 0 ? bedrooms : null;
  if (t === "studio") return "studio";
  if (t === "flat") return beds === 1 ? "flat-1" : beds === 2 ? "flat-2" : null;
  if (t === "house") return beds === 2 ? "house-2" : beds === 3 ? "house-3" : beds === 4 ? "house-4" : null;
  if (t === "hmo") return beds === 5 ? "hmo-5" : null;
  return null;
}
