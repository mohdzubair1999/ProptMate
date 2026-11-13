// The database filter for "search the properties by what was typed": the same four things the Properties page searches (address, city, postcode, landlord's name),
// ignoring capitals. Nothing typed (or only spaces) means no filter; very long text is cut so a huge paste cannot make a slow search.
export const MAX_SEARCH_CHARS = 100;
export type PropertySearchFilter = { OR: { [field in "address" | "city" | "postcode" | "landlordName"]?: { contains: string; mode: "insensitive" } }[] } | Record<string, never>;
export function propertySearchFilter(q: unknown): PropertySearchFilter {
  const text = typeof q === "string" ? q.trim().slice(0, MAX_SEARCH_CHARS).trim() : "";
  if (!text) return {};
  const m = (field: "address" | "city" | "postcode" | "landlordName") => ({ [field]: { contains: text, mode: "insensitive" as const } });
  return { OR: [m("address"), m("city"), m("postcode"), m("landlordName")] };
}
