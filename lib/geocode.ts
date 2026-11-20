import { cleanPostcode } from "@/lib/routePlan";

// Looks up the latitude and longitude of UK postcodes with the free postcodes.io service (no key). Returns only the ones it found; any problem means "no position", never an error.
export async function geocodePostcodes(postcodes: (string | null | undefined)[]): Promise<Map<string, { lat: number; lng: number }>> {
  const wanted = [...new Set(postcodes.map(cleanPostcode).filter((p): p is string => !!p))].slice(0, 100);
  const out = new Map<string, { lat: number; lng: number }>();
  if (wanted.length === 0) return out;
  try {
    const res = await fetch("https://api.postcodes.io/postcodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postcodes: wanted }), signal: AbortSignal.timeout(6000) });
    if (!res.ok) return out;
    const data: any = await res.json();
    for (const r of Array.isArray(data?.result) ? data.result : []) {
      const q = cleanPostcode(r?.query), lat = r?.result?.latitude, lng = r?.result?.longitude;
      if (q && typeof lat === "number" && typeof lng === "number") out.set(q, { lat, lng });
    }
  } catch { /* no positions: the day is still listed in time order */ }
  return out;
}
