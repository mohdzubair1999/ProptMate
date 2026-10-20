// Measures how accurately photos are described, using YOUR photos and what you know is in them.
//
//   npx tsx --env-file=.env scripts/eval-photo-analysis.ts            (reads the photo-eval folder)
//   npx tsx --env-file=.env scripts/eval-photo-analysis.ts --runs 3   (describes each set 3 times, to see how consistent it is)
//   npx tsx --env-file=.env scripts/eval-photo-analysis.ts --deep     (uses the deeper, costlier model)
//
// It uses exactly the code the live "Analyse photo" button uses (lib/photoAnalysis.ts), including the automatic
// rewrite of advice out of inventory reports, so the numbers describe what people really get. Each run of each set is
// one AI call (plus one more when a rewrite is needed). See photo-eval/README.md.
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { analysePhotos, modelFor } from "../lib/photoAnalysis";
import { resizeForVision } from "../lib/fetchAndResizeImage";
import { scoreCase, summarisePhotos, type CaseScore, type PhotoCase } from "../lib/photoScore";

const DIR = process.env.PHOTO_EVAL_DIR || join(__dirname, "..", "photo-eval");
const arg = (name: string) => process.argv.indexOf(name);
const RUNS = arg("--runs") > 0 ? Math.max(1, Math.min(10, parseInt(process.argv[arg("--runs") + 1], 10) || 1)) : 1;
const DEEP = arg("--deep") > 0;
const provider = arg("--provider") > 0 && process.argv[arg("--provider") + 1] === "openai" ? "openai" : "anthropic";
const pc = (n: number | null) => (n === null ? "-" : `${Math.round(n * 100)}%`);

async function main() {
  const keys = { anthropic: process.env.ANTHROPIC_API_KEY, openai: process.env.OPENAI_API_KEY };
  if (!keys[provider]) throw new Error(`${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"} is not set. Run with: npx tsx --env-file=.env scripts/eval-photo-analysis.ts`);
  const files = readdirSync(DIR).filter((n) => n.endsWith(".json") && !n.startsWith("results-") && n !== "example.json");
  if (files.length === 0) throw new Error(`No photo sets found. Put photos and matching .json files in ${DIR} (see README.md).`);
  console.log(`Provider ${provider}, model ${modelFor(provider, DEEP)}, ${RUNS} run(s) per set\n`);

  const scores: CaseScore[] = [], log: unknown[] = [];
  for (const file of files) {
    let c: PhotoCase;
    try { c = JSON.parse(readFileSync(join(DIR, file), "utf8")); } catch { console.log(`Skipping ${file}: it is not valid JSON.`); continue; }
    const okShape = typeof c?.name === "string" && Array.isArray(c.photos) && c.photos.length > 0 && c.photos.every((p) => typeof p === "string") && (c.mode === "inventory" || c.mode === "maintenance") && typeof c.expect === "object" && c.expect !== null;
    if (!okShape) { console.log(`Skipping ${file}: a photo set needs a "name", a list of "photos", a "mode" of inventory or maintenance, and an "expect" section (see README.md).`); continue; }
    let images: { base64: string; mediaType: string }[];
    try { images = await Promise.all(c.photos.map(async (p) => resizeForVision(readFileSync(join(DIR, p))))); } catch { console.log(`Skipping ${file}: could not read one of its photos (are they in the same folder, and are they images?).`); continue; }
    for (let run = 1; run <= RUNS; run++) {
      const r = await analysePhotos({ images, provider, deep: DEEP, identifyRoom: !!c.identifyRoom, allowRecommendations: c.mode === "maintenance", context: c.context, existingNotes: c.existingNotes, keys });
      if (!r.ok) { console.log(`${c.name} run ${run}: FAILED (${r.error})`); log.push({ file, run, error: r.error }); continue; }
      const s = scoreCase(c, r); scores.push(s);
      const bits: string[] = [];
      if (s.mentionsTotal) bits.push(`mentions ${s.mentionsHit}/${s.mentionsTotal}`);
      if (s.trapCases) bits.push(s.trapsHit.length ? `INVENTED: ${s.trapsHit.join(", ")}` : "no invented claims");
      if (s.isClean) bits.push(s.falseAlarm.length ? `FALSE ALARM: ${s.falseAlarm.join(", ")}` : "clean, correctly");
      if (s.roomsTotal) bits.push(`rooms ${s.roomsHit}/${s.roomsTotal}`);
      if (c.mode === "inventory") bits.push(s.breaches.length ? `ADVICE LEFT IN: ${s.breaches.map((b) => b.phrase).join(", ")}` : s.rewritten ? "advice removed by the automatic rewrite" : "wording rules kept");
      console.log(`${c.name.padEnd(30)} run ${run}: ${bits.length ? bits.join(" | ") : "scored"}`);
      log.push({ file, run, score: s, description: r.description, wordingWarnings: r.wordingWarnings, attempts: r.attempts });
    }
  }
  const sm = summarisePhotos(scores);
  console.log("\n=== SUMMARY ===");
  console.log(`Descriptions scored: ${sm.cases}`);
  console.log(`Known defects mentioned (recall):        ${pc(sm.recall)}`);
  console.log(`Descriptions fully right:                ${pc(sm.perfect)}`);
  console.log(`Invented a claim you said is false:      ${pc(sm.trapRate)}   (lower is better)`);
  console.log(`Reported a defect in a clean photo:      ${pc(sm.falseAlarmRate)}   (lower is better)`);
  console.log(`Inventory answers that still gave advice or said "not tested": ${pc(sm.advicePassedThrough)}   (should be 0%)`);
  console.log(`Inventory answers the rewrite had to fix: ${pc(sm.rewriteRate)}`);
  console.log(`Rooms identified correctly:              ${pc(sm.roomAccuracy)}`);
  console.log(`Average length: ${sm.avgWords === null ? "-" : Math.round(sm.avgWords)} words; cut off: ${pc(sm.truncatedRate)}; asked you a question: ${pc(sm.asksQuestions)}`);
  const out = join(DIR, `results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify({ provider, model: modelFor(provider, DEEP), summary: sm, runs: log }, null, 2));
  console.log(`\nFull results (including every description) written to ${out}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
