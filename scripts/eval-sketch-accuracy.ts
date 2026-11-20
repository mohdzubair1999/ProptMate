// Measures how accurately hand-drawn sketches are read, using YOUR sketches and their TRUE sizes.
//
//   npx tsx@4.23.15 --env-file=.env scripts/eval-sketch-accuracy.ts            (reads the sketch-eval folder)
//   npx tsx@4.23.15 --env-file=.env scripts/eval-sketch-accuracy.ts --runs 3   (reads each sketch 3 times, to see how consistent it is)
//
// It uses exactly the code the live upload uses (lib/sketchPipeline.ts), so the numbers describe what people really
// get. Each sketch costs one AI call per run. See sketch-eval/README.md for how to prepare the sketches.
import { readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { prepareSketchImage, readSketch } from "../lib/sketchPipeline";
import { calibrateRooms, type SizeSource } from "../lib/sketchPlan";
import { scoreSketch, summarise, type SketchScore, type TruthRoom } from "../lib/sketchScore";

const DIR = process.env.SKETCH_EVAL_DIR || join(__dirname, "..", "sketch-eval");
const runsArg = process.argv.indexOf("--runs");
const RUNS = runsArg > 0 ? Math.max(1, Math.min(10, parseInt(process.argv[runsArg + 1], 10) || 1)) : 1;
const f = (n: number | null, d = 0, suffix = "") => (n === null || !Number.isFinite(n) ? "-" : `${n.toFixed(d)}${suffix}`);

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set. Run with: npx tsx@4.23.15 --env-file=.env scripts/eval-sketch-accuracy.ts");
  const truths = readdirSync(DIR).filter((n) => n.endsWith(".json") && !n.startsWith("results-") && n !== "example.json");
  if (truths.length === 0) throw new Error(`No sketches found. Put sketch images and matching .json files in ${DIR} (see README.md).`);

  const raw: SketchScore[] = [], afterOne: SketchScore[] = [], log: unknown[] = [];
  for (const file of truths) {
    // A folder can hold other files; only a description with an image name and a list of rooms with sizes counts.
    let truth: { image: string; rooms: TruthRoom[] };
    try {
      truth = JSON.parse(readFileSync(join(DIR, file), "utf8"));
    } catch {
      console.log(`Skipping ${file}: it is not valid JSON.`);
      continue;
    }
    const sizeOk = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n > 0;
    if (typeof truth?.image !== "string" || !Array.isArray(truth.rooms) || truth.rooms.length === 0 || !truth.rooms.every((r) => r && typeof r.name === "string" && sizeOk(r.widthM) && sizeOk(r.lengthM))) {
      console.log(`Skipping ${file}: a sketch description needs an "image" name and a list of "rooms", each with a name, widthM and lengthM in metres (see README.md).`);
      continue;
    }
    let image: string;
    try {
      image = await prepareSketchImage(readFileSync(join(DIR, truth.image)));
    } catch {
      console.log(`Skipping ${file}: could not read the image "${truth.image}" (is it in the same folder, and is it a photo?).`);
      continue;
    }
    for (let run = 1; run <= RUNS; run++) {
      const out = await readSketch({ apiKey, imageBase64: image });
      if (!out.ok) { console.log(`${file} run ${run}: FAILED (${out.error})`); log.push({ file, run, error: out.error }); continue; }
      const pred = out.result.rooms.map((r) => ({ name: r.name, widthM: r.widthM, lengthM: r.lengthM, connectsTo: r.connectsTo as string[], sizeSource: r.sizeSource }));
      const score = scoreSketch(truth.rooms, pred); raw.push(score);

      // What if the person then typed in ONE real measurement (the biggest room's long side)? Shows what calibration buys.
      const rooms = out.result.rooms.map((r) => ({ name: r.name, widthM: String(r.widthM), lengthM: String(r.lengthM) }));
      const sources: Record<string, SizeSource | undefined> = Object.fromEntries(out.result.rooms.map((r) => [r.name, r.sizeSource]));
      const tBig = [...truth.rooms].sort((a, b) => b.widthM * b.lengthM - a.widthM * a.lengthM)[0];
      const pIdx = pred.findIndex((p) => score.pairs.some((s) => s.pred === p.name && s.truth === tBig.name));
      let after: SketchScore | null = null;
      if (pIdx >= 0) {
        const p = pred[pIdx], dim = p.widthM >= p.lengthM ? "width" : "length";
        const cal = calibrateRooms(rooms, sources, { index: pIdx, dimension: dim, valueM: Math.max(tBig.widthM, tBig.lengthM) });
        if (!("error" in cal)) { after = scoreSketch(truth.rooms, cal.rooms.map((r, i) => ({ ...pred[i], widthM: parseFloat(r.widthM), lengthM: parseFloat(r.lengthM) }))); afterOne.push(after); }
      }
      const s = summarise([score]);
      console.log(`${file.padEnd(28)} run ${run}: rooms found ${score.matched}/${score.truthRooms}${score.extra.length ? ` (+${score.extra.length} extra)` : ""}, median size error ${f(s.medianSideErrPct, 0, "%")}, within 10%: ${f((s.within10 ?? NaN) * 100, 0, "%")}, written ${out.result.counts.written}/estimated ${out.result.counts.estimated}${after ? `, after one measurement: ${f(summarise([after]).medianSideErrPct, 0, "%")}` : ""}`);
      log.push({ file, run, score, afterOneMeasurement: after, counts: out.result.counts, warnings: out.result.warnings });
    }
  }

  const show = (label: string, s: ReturnType<typeof summarise>) =>
    console.log(`${label.padEnd(46)} rooms found ${f((s.detectionRate ?? NaN) * 100, 0, "%")} | median size error ${f(s.medianSideErrPct, 1, "%")} | within 5% ${f((s.within5 ?? NaN) * 100, 0, "%")} | within 10% ${f((s.within10 ?? NaN) * 100, 0, "%")} | within 20% ${f((s.within20 ?? NaN) * 100, 0, "%")} | doors ${f((s.doorPrecision ?? NaN) * 100, 0, "%")} right, ${f((s.doorRecall ?? NaN) * 100, 0, "%")} found`);
  console.log("\n=== SUMMARY ===");
  show("All rooms", summarise(raw));
  show("Sizes read from writing on the sketch", summarise(raw, (p) => p.source === "written"));
  show("Sizes the AI had to estimate", summarise(raw, (p) => p.source === "estimated" || p.source === "unverified"));
  if (afterOne.length) show("Estimates after typing ONE real measurement", summarise(afterOne, (p) => p.source === "estimated" || p.source === "unverified"));
  const out = join(DIR, `results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`);
  writeFileSync(out, JSON.stringify(log, null, 2));
  console.log(`\nFull results written to ${out}`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
