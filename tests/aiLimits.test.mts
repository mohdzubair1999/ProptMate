import { readFileSync } from "node:fs";
import { analysisLimits, DETAILED_PHOTOS_PER_REQUEST } from "../lib/aiLimits";
import { DETAILED_BATCH_SIZE, QUICK_BATCH_SIZE } from "../lib/analyseBatches";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const NAMES = ["AI_LIMIT_DETAILED_PER_15_MIN", "AI_LIMIT_QUICK_PER_15_MIN", "AI_LIMIT_REQUESTS_PER_15_MIN", "AI_LIMIT_PHOTO_UNITS_PER_15_MIN", "AI_LIMIT_DETAILED_PER_DAY", "AI_LIMIT_PHOTO_UNITS_PER_DAY"] as const;
const KEYS = ["detailedPer15", "quickPer15", "requestsPer15", "photoUnitsPer15", "detailedPerDay", "photoUnitsPerDay"] as const;
const clear = () => NAMES.forEach((n) => delete process.env[n]);
clear();
const d = analysisLimits();
ok("the defaults: Detailed 120 requests per 15 minutes (480 photos), Quick 40, all requests 150, photos 1,800 (600 Detailed photos), and per COMPANY per day 600 Detailed requests (2,400 photos) and 12,000 photos", d.detailedPer15 === 120 && d.quickPer15 === 40 && d.requestsPer15 === 150 && d.photoUnitsPer15 === 1800 && d.detailedPerDay === 600 && d.photoUnitsPerDay === 12000, d);
ok("the defaults are well above what the old limits allowed (40 / 20 / 60 / 600 / 300 / 6,000), so a big job no longer stops early", d.detailedPer15 > 40 && d.quickPer15 > 20 && d.requestsPer15 > 60 && d.photoUnitsPer15 > 600 && d.detailedPerDay > 300 && d.photoUnitsPerDay > 6000);
ok("a big job fits: 384 photos is 96 Detailed requests (under 120) and 1,152 photo units (under 1,800), and a day with 5 such jobs is 480 requests (under 600)", Math.ceil(384 / DETAILED_PHOTOS_PER_REQUEST) < d.detailedPer15 && 384 * 3 < d.photoUnitsPer15 && 5 * Math.ceil(384 / DETAILED_PHOTOS_PER_REQUEST) < d.detailedPerDay);
ok("the limits never contradict each other: the request limit for Detailed is not above the all-requests limit", d.detailedPer15 <= d.requestsPer15 && d.quickPer15 <= d.requestsPer15);
NAMES.forEach((n, i) => { process.env[n] = String(1000 + i); }); const o = analysisLimits();
ok("each limit can be changed in the hosting settings, with its own name, and is read at the time of use", KEYS.every((k, i) => o[k] === 1000 + i), o);
process.env.AI_LIMIT_DETAILED_PER_15_MIN = "  250  "; ok("spaces around a number are ignored", analysisLimits().detailedPer15 === 250);
for (const bad of ["", "   ", "abc", "0", "-5", "1.5", "1e3", "0x10", "NaN", "Infinity", "10 000", "1,000", "+5", "12345678", "1000001", "--", "٣"]) { process.env.AI_LIMIT_DETAILED_PER_15_MIN = bad; ok(`a mistyped setting '${bad}' is ignored and the default of 120 is used (a typo can never switch a limit off or set it silly)`, analysisLimits().detailedPer15 === 120, analysisLimits().detailedPer15); }
process.env.AI_LIMIT_DETAILED_PER_15_MIN = "1000000"; ok("the largest accepted value is 1,000,000 and the smallest is 1", analysisLimits().detailedPer15 === 1000000 && (process.env.AI_LIMIT_DETAILED_PER_15_MIN = "1", analysisLimits().detailedPer15 === 1));
delete process.env.AI_LIMIT_DETAILED_PER_15_MIN; ok("removing a setting returns to the default", analysisLimits().detailedPer15 === 120);
clear();
// ---- the numbers are used, not typed in again somewhere else ----
const route = readFileSync("app/api/ai/analyze-photo/route.ts", "utf8"), page = readFileSync("app/dashboard/settings/ai-usage/page.tsx", "utf8"), button = readFileSync("components/AnalyzePhotoButton.tsx", "utf8");
ok("the analyse route takes every limit from the shared module and has none typed in", route.includes("analysisLimits()") && ["limits.detailedPer15", "limits.quickPer15", "limits.requestsPer15", "limits.photoUnitsPer15", "limits.detailedPerDay", "limits.photoUnitsPerDay"].every((s) => route.includes(s)) && !/max:\s*(600|60|40|20)\b/.test(route) && !/companyDaily:\s*\d/.test(route));
ok("the AI usage page shows the same daily figure the route enforces (it reads it from the same place)", page.includes("analysisLimits().detailedPerDay") && !/DETAILED_DAILY_LIMIT\s*=\s*\d/.test(page));
ok("the screen sends 4 photos per Detailed request and 12 per Quick request (Quick used to send 40, which made the AI skip things), the same numbers the limits are described in, and the server accepts at least that many", DETAILED_PHOTOS_PER_REQUEST === 4 && DETAILED_BATCH_SIZE === 4 && QUICK_BATCH_SIZE === 12 && /depth === "detailed" \? DETAILED_BATCH_SIZE : QUICK_BATCH_SIZE/.test(button) && /MAX_DETAILED_PHOTOS\s*=\s*8/.test(route));
const envEx = readFileSync(".env.example", "utf8"), readme = readFileSync("README.md", "utf8");
ok("all six settings are written down, with their defaults, in .env.example and in the README (so a person can find their names)", NAMES.every((n) => envEx.includes(n) && readme.includes(n)) && NAMES.every((n, i) => envEx.includes(`${n}="${[120, 40, 150, 1800, 600, 12000][i]}"`)) && NAMES.every((n, i) => new RegExp("`" + n + "` \\| " + [120, 40, 150, 1800, 600, 12000][i]).test(readme)));
console.log(`\nAI analysis limits (changeable in the hosting settings): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
