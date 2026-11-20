// Measures how accurately photos are described, using YOUR photos and what you know is in them.
//
//   npx tsx@4.23.15 --env-file=.env scripts/eval-photo-analysis.ts            (reads the photo-eval folder)
//   npx tsx@4.23.15 --env-file=.env scripts/eval-photo-analysis.ts --runs 3   (describes each set 3 times, to see how consistent it is)
//   npx tsx@4.23.15 --env-file=.env scripts/eval-photo-analysis.ts --deep     (uses the deeper, costlier model, one pass)
//   npx tsx@4.23.15 --env-file=.env scripts/eval-photo-analysis.ts --detailed (the Detailed mode of the button: close-up crops, a first pass that lists everything, then the description)
//   npx tsx@4.23.15 --env-file=.env scripts/eval-photo-analysis.ts --compare  (runs Quick and Detailed on the same photos and shows them side by side)
//
// It uses exactly the code the live "Analyse photo" button uses (lib/photoAnalysis.ts), including the automatic
// rewrite of advice out of inventory reports, so the numbers describe what people really get. Each run of each set is
// one AI call (plus one more when a rewrite is needed). See photo-eval/README.md.
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { analysePhotos, modelFor } from "../lib/photoAnalysis";
import { resizeForVision } from "../lib/fetchAndResizeImage";
import { makeTiles } from "../lib/photoTiles";
import { scoreCase, summarisePhotos, type CaseScore, type PhotoCase } from "../lib/photoScore";

const DIR = process.env.PHOTO_EVAL_DIR || join(__dirname, "..", "photo-eval");
const arg = (name: string) => process.argv.indexOf(name);
const RUNS = arg("--runs") > 0 ? Math.max(1, Math.min(10, parseInt(process.argv[arg("--runs") + 1], 10) || 1)) : 1;
const DEEP = arg("--deep") > 0;
const COMPARE = arg("--compare") > 0;
const DETAILED = arg("--detailed") > 0;
// quick = the cheaper model, one pass; deep = the stronger model, one pass; detailed = the stronger model with crops and a first pass (what the button's Detailed does)
// report = what the button's Detailed does now (ONE structured call, the comments built in code, no crops); detailed = the older TWO-step Detailed (a list, then a rewrite, with crops)
type Mode = "quick" | "deep" | "report" | "detailed";
const TWO_STEP = arg("--two-step") > 0;
const MODES: Mode[] = COMPARE ? ["quick", "report", "detailed"] : [TWO_STEP ? "detailed" : DETAILED ? "report" : DEEP ? "deep" : "quick"];
const NAMES: Record<Mode, string> = { quick: "Quick", deep: "Deep", report: "Detailed (now)", detailed: "Two-step (old)" };
const provider = arg("--provider") > 0 && process.argv[arg("--provider") + 1] === "openai" ? "openai" : "anthropic";
const pc = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);

async function main() {
  const keys = { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
  if (!keys[provider]) throw new Error(`${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} is not set. Run with: npx tsx@4.23.15 --env-file=.env scripts/eval-photo-analysis.ts`);
  const files = readdirSync(DIR).filter((n) => n.endsWith(".json") && !n.startsWith("results-") && n !== "example.json");
  if (files.length === 0) throw new Error(`No photo sets found. Put photos and matching .json files in ${DIR} (see README.md).`);
  console.log(COMPARE ? `Provider ${provider}, comparing Quick (${modelFor(provider, false)}) with Detailed (${modelFor(provider, true)}), ${RUNS} run(s) per set\n` : `Provider ${provider}, model ${modelFor(provider, MODES[0] !== "quick")}, ${RUNS} run(s) per set\n`);

  const scoresBy: Record<string, CaseScore[]> = Object.fromEntries(MODES.map((m) => [m, [] as CaseScore[]]));
  const seconds: Record<string, number[]> = Object.fromEntries(MODES.map((m) => [m, [] as number[]])); // how long each description took, per mode
  const log: unknown[] = [];
  for (const file of files) {
    let c: PhotoCase;
    try { c = JSON.parse(readFileSync(join(DIR, file), "utf8")); } catch { console.log(`Skipping ${file}: it is not valid JSON.`); continue; }
    const okShape = typeof c?.name === "string" && Array.isArray(c.photos) && c.photos.length > 0 && c.photos.every((p) => typeof p === "string") && (c.mode === "inventory" || c.mode === "maintenance") && typeof c.expect === "object" && c.expect !== null;
    if (!okShape) { console.log(`Skipping ${file}: a photo set needs a "name", a list of "photos", a "mode" of inventory or maintenance, and an "expect" section (see README.md).`); continue; }
    let images: { base64: string; mediaType: string }[];
    let tiles: { photo: number; label: string; base64: string; mediaType: string }[] = [];
    let checkInImages: { base64: string; mediaType: string }[] = [];
    try { images = await Promise.all(c.photos.map(async (p) => resizeForVision(readFileSync(join(DIR, p)))));
      // close-up crops of the first four large photos, exactly as the live Detailed mode makes them
      if (MODES.includes("detailed")) tiles = (await Promise.all(c.photos.slice(0, 4).map(async (p) => makeTiles(readFileSync(join(DIR, p)))))).flatMap((ts, photo) => ts.map((t) => ({ photo, ...t })));
      if (Array.isArray(c.checkInPhotos)) checkInImages = await Promise.all(c.checkInPhotos.slice(0, 3).map(async (p) => resizeForVision(readFileSync(join(DIR, p)), 1024))); } catch { console.log(`Skipping ${file}: could not read one of its photos (are they in the same folder, and are they images?).`); continue; }
    for (let run = 1; run <= RUNS; run++) for (const mode of MODES) {
      const tag = COMPARE ? `[${mode}] ` : "";
      // exactly what the live button sends for each mode: every mode asks for the full range of detail; the detailed one adds the crops and the first pass
      const t0 = Date.now();
      const r = await analysePhotos({ images, provider, deep: mode !== "quick", coverage: true, detailed: mode === "detailed" || mode === "report", report: mode === "report", style: "bullets", tiles: mode === "detailed" ? tiles : undefined, identifyRoom: !!c.identifyRoom, allowRecommendations: c.mode === "maintenance", context: c.context, existingNotes: c.existingNotes, checkInImages, keys });
      const secs = (Date.now() - t0) / 1000;
      if (!r.ok) { console.log(`${tag}${c.name} run ${run}: FAILED after ${secs.toFixed(0)} s (${r.error})`); log.push({ file, run, mode, seconds: secs, error: r.error }); continue; }
      const s = scoreCase(c, r); scoresBy[mode].push(s); seconds[mode].push(secs);
      const bits: string[] = [];
      if (s.mentionsTotal) bits.push(`mentions ${s.mentionsHit}/${s.mentionsTotal}`);
      if (s.trapCases) bits.push(s.trapsHit.length ? `INVENTED: ${s.trapsHit.join(", ")}` : "no invented claims");
      if (s.isClean) bits.push(s.falseAlarm.length ? `FALSE ALARM: ${s.falseAlarm.join(", ")}` : "clean, correctly");
      if (s.noChangeExpected) bits.push(s.falseChange.length ? `FALSE CHANGE REPORTED: ${s.falseChange.join(", ")}` : "no change reported, correctly");
      if (checkInImages.length) bits.push(`compared with ${r.comparedWithCheckIn} check-in photo(s)`);
      if (s.roomsTotal) bits.push(`rooms ${s.roomsHit}/${s.roomsTotal}`);
      if (mode === "detailed" || mode === "report") bits.push(r.detailPass === "used" ? `detail pass used (${r.details?.items.length ?? 0} items, ${r.details?.defects.length ?? 0} defects listed${tiles.length ? `, ${tiles.length} crops` : ""})` : `detail pass ${r.detailPass}`);
      if (c.mode === "inventory") bits.push(s.breaches.length ? `ADVICE LEFT IN: ${s.breaches.map((b) => b.phrase).join(", ")}` : s.rewritten ? "advice removed by the automatic rewrite" : "wording rules kept");
      console.log(`${tag}${c.name.padEnd(30)} run ${run}: ${bits.length ? bits.join(" | ") : "scored"} (${secs.toFixed(0)} s)`);
      log.push({ file, run, mode, seconds: secs, score: s, description: r.description, wordingWarnings: r.wordingWarnings, attempts: r.attempts, detailPass: r.detailPass, details: r.details });
    }
  }
  const print = (sm: ReturnType<typeof summarisePhotos>) => {
    console.log(`Descriptions scored: ${sm.cases}`);
    console.log(`Known defects mentioned (recall):        ${pc(sm.recall)}`);
    console.log(`Descriptions fully right:                ${pc(sm.perfect)}`);
    console.log(`Invented a claim you said is false:      ${pc(sm.trapRate)}   (lower is better)`);
    console.log(`Reported a defect in a clean photo:      ${pc(sm.falseAlarmRate)}   (lower is better)`);
    console.log(`Reported a change where there was none:  ${pc(sm.falseChangeRate)}   (lower is better; needs sets with checkInPhotos and noChange)`);
    console.log(`Inventory answers that still gave advice or said "not tested": ${pc(sm.advicePassedThrough)}   (should be 0%)`);
    console.log(`Inventory answers the rewrite had to fix: ${pc(sm.rewriteRate)}`);
    console.log(`Rooms identified correctly:              ${pc(sm.roomAccuracy)}`);
    console.log(`Average length: ${sm.avgWords === null ? "-" : Math.round(sm.avgWords)} words; cut off: ${pc(sm.truncatedRate)}; asked you a question: ${pc(sm.asksQuestions)}`);
  };
  const summaries = Object.fromEntries(MODES.map((m) => [m, summarisePhotos(scoresBy[m])]));
  console.log("\n=== SUMMARY ===");
  if (!COMPARE) print(summaries[MODES[0]]);
  else {
    // the numbers that matter for "is it missing detail?", side by side; recall is the share of the known details (the "mentions" you listed) that were written down
    const avg = (xs: number[]) => (xs.length ? xs.reduce((n, x) => n + x, 0) / xs.length : null);
    console.log(`${"".padEnd(44)} ${MODES.map((m) => NAMES[m].padStart(16)).join(" ")}`);
    const row = (label: string, pick: (sm: ReturnType<typeof summarisePhotos>) => number | null) => console.log(`${label.padEnd(44)} ${MODES.map((m) => pc(pick(summaries[m])).padStart(16)).join(" ")}`);
    row("Known details mentioned (recall; higher is better)", (x) => x.recall);
    row("Descriptions fully right (higher is better)", (x) => x.perfect);
    row("Invented a claim you said is false (lower)", (x) => x.trapRate);
    row("Reported a defect in a clean photo (lower)", (x) => x.falseAlarmRate);
    row("Advice or 'not tested' left in, inventory (lower)", (x) => x.advicePassedThrough);
    console.log(`${"Average length (words)".padEnd(44)} ${MODES.map((m) => String(summaries[m].avgWords === null ? "-" : Math.round(summaries[m].avgWords as number)).padStart(16)).join(" ")}`);
    console.log(`${"Average time per photo set (seconds; lower)".padEnd(44)} ${MODES.map((m) => { const a = avg(seconds[m]); return (a === null ? "-" : a.toFixed(1)).padStart(16); }).join(" ")}`);
    console.log("\nQuick: the cheaper model, one call. Detailed (now): the stronger model, ONE structured call, the report comments built from its list (every element it lists is in the report). Two-step (old): a list, then a second call that rewrote it as text, with crop images (slower). Judge by YOUR photos: recall and time are the two lines that matter.\n");
    for (const m of MODES) { console.log(`--- ${m.toUpperCase()} ---`); print(summaries[m]); }
  }
  const out = join(DIR, `results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify({ provider, models: Object.fromEntries(MODES.map((m) => [m, modelFor(provider, m !== "quick")])), summary: COMPARE ? summaries : summaries[MODES[0]], runs: log }, null, 2));
  console.log(`\nFull results (including every description) written to ${out}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
