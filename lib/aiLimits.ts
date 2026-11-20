// How much AI photo analysis one person and one company may use. Every AI call costs real money, so there are limits; but they must not get in the way of a
// normal big job (a property with a few hundred photos). Each number can be changed in the hosting settings (an environment variable) without touching the code:
// a missing, empty, non-numeric, fractional, zero or negative value is ignored and the default is used instead, so a typo can never switch a limit off.
//
// "Per 15 minutes" limits are only SPEED limits (the same work costs the same, it just cannot all be done at once). The "per day" limits are the real spending
// ceiling for the whole company. A Detailed request is 4 photos, and a Detailed photo counts as 3 against the photo allowance.
const intEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const t = raw.trim();
  if (!/^\d{1,7}$/.test(t)) return fallback; // plain whole numbers only: no signs, decimals, exponents or hex
  const n = Number(t);
  return n >= 1 && n <= 1_000_000 ? n : fallback;
};

export function analysisLimits() {
  return {
    detailedPer15: intEnv("AI_LIMIT_DETAILED_PER_15_MIN", 120), // Detailed requests per person: 120 is 480 photos
    quickPer15: intEnv("AI_LIMIT_QUICK_PER_15_MIN", 40), // Quick requests per person (12 photos each)
    requestsPer15: intEnv("AI_LIMIT_REQUESTS_PER_15_MIN", 150), // all analysis requests per person
    photoUnitsPer15: intEnv("AI_LIMIT_PHOTO_UNITS_PER_15_MIN", 1800), // photos per person, a Detailed photo counting three: 1,800 is 600 Detailed photos
    detailedPerDay: intEnv("AI_LIMIT_DETAILED_PER_DAY", 600), // Detailed requests per COMPANY per day: 600 is 2,400 photos
    photoUnitsPerDay: intEnv("AI_LIMIT_PHOTO_UNITS_PER_DAY", 12000), // photos per COMPANY per day, a Detailed photo counting three
  };
}
export const DETAILED_PHOTOS_PER_REQUEST = 4; // how many photos one Detailed request carries (the screen sends this many)
