// The inspector's day: put the visits in a sensible order and estimate the drive between them. Pure code, tested directly.
// Drive times are ESTIMATES from straight-line distance (no live traffic), and are shown as such.
export type Stop = { id: string; address: string; postcode: string | null; at: Date | null; lat: number | null; lng: number | null };
export type PlannedStop = Stop & { driveMinutesFromPrevious: number | null; km: number | null; tight: boolean; timed: boolean };

export const AVG_KMH = 28; // town and city driving
export const ROAD_FACTOR = 1.3; // roads are longer than the straight line
export const PARKING_MINUTES = 5;
export const VISIT_MINUTES = 60;

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function driveMinutes(km: number): number {
  if (!Number.isFinite(km) || km < 0) return 0;
  return Math.round(((km * ROAD_FACTOR) / AVG_KMH) * 60 + PARKING_MINUTES);
}

const hasPos = (s: Stop): s is Stop & { lat: number; lng: number } => typeof s.lat === "number" && typeof s.lng === "number";

// A time of exactly midnight in the UK means "a date was set, no time": such a visit has no fixed slot.
export function hasClockTime(d: Date | null): boolean {
  if (!d || Number.isNaN(d.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value, m = parts.find((p) => p.type === "minute")?.value;
  return !(h === "00" && m === "00") && !(h === "24" && m === "00");
}

// Visits with a time keep their time order. Visits without one are slotted in, nearest first, after the timed visit closest to them.
export function planDay(stops: Stop[], visitMinutes = VISIT_MINUTES): PlannedStop[] {
  const timed = stops.filter((s) => hasClockTime(s.at)).sort((a, b) => a.at!.getTime() - b.at!.getTime());
  let loose = stops.filter((s) => !hasClockTime(s.at));
  const order: Stop[] = [];
  const nearest = (from: Stop | undefined, pool: Stop[]): number => {
    if (!from || !hasPos(from)) return 0;
    let best = -1, bd = Infinity;
    pool.forEach((s, i) => { if (!hasPos(s)) return; const d = haversineKm(from, s); if (d < bd) { bd = d; best = i; } });
    return best === -1 ? 0 : best;
  };
  // loose visits first go to the start of the day if nothing is timed, otherwise after the nearest timed visit
  if (timed.length === 0) {
    let cur: Stop | undefined;
    while (loose.length) { const i = nearest(cur, loose); cur = loose.splice(i, 1)[0]; order.push(cur); }
  } else {
    const buckets: Stop[][] = timed.map(() => []);
    const unplaced: Stop[] = []; // no position known: nothing to measure from, so it goes at the end of the day
    for (const s of loose) {
      if (!hasPos(s)) { unplaced.push(s); continue; }
      let bi = 0, bd = Infinity;
      timed.forEach((t, i) => { const d = hasPos(t) ? haversineKm(s, t) : Infinity; if (d < bd) { bd = d; bi = i; } });
      buckets[bi].push(s);
    }
    timed.forEach((t, i) => {
      order.push(t);
      let cur: Stop = t; const pool = buckets[i];
      while (pool.length) { const j = nearest(cur, pool); cur = pool.splice(j, 1)[0]; order.push(cur); }
    });
    order.push(...unplaced);
  }
  return order.map((s, i) => {
    const prev = order[i - 1];
    let km: number | null = null, mins: number | null = null;
    if (prev && hasPos(prev) && hasPos(s)) { km = Math.round(haversineKm(prev, s) * 10) / 10; mins = driveMinutes(km); }
    // tight: this visit has a fixed time and the previous visit (if timed) plus the drive would not fit
    const tight = !!(prev && s.at && hasClockTime(s.at) && prev.at && hasClockTime(prev.at) && mins !== null && s.at.getTime() - prev.at.getTime() < (visitMinutes + mins) * 60000);
    return { ...s, km, driveMinutesFromPrevious: mins, tight, timed: hasClockTime(s.at) };
  });
}

export function mapsLink(s: { address: string; postcode: string | null }): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent([s.address, s.postcode].filter(Boolean).join(", "))}`;
}

// UK-local day as a UTC range, correct across summer time. Returns null for anything that is not YYYY-MM-DD.
export function ukDayRange(day: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const noon = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(noon.getTime()) || noon.toISOString().slice(0, 10) !== day) return null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hour12: false }).format(noon)) % 24;
  const offset = hour - 12; // 0 in winter, 1 in summer
  const start = new Date(new Date(`${day}T00:00:00Z`).getTime() - offset * 3600000);
  return { start, end: new Date(start.getTime() + 24 * 3600000) };
}

export function cleanPostcode(p: unknown): string | null {
  const s = String(p ?? "").toUpperCase().replace(/\s+/g, "");
  return /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(s) ? `${s.slice(0, -3)} ${s.slice(-3)}` : null;
}

// The postcode to use for a property: the postcode field, or one found inside the address text (many addresses are saved as one line).
export function postcodeFor(postcode: unknown, address: unknown): string | null {
  const direct = cleanPostcode(postcode);
  if (direct) return direct;
  const m = String(address ?? "").toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  return m ? cleanPostcode(m[1] + m[2]) : null;
}
