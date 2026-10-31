// Measures the meter and appliance-label readers on photos whose truth you know. Nothing is saved or uploaded to ProptMate.
//
//   npx tsx@4.23.15 --env-file=.env scripts/eval-reading.ts [--runs 3]
//
// Put sets in reading-eval/ (see reading-eval/README.md). The number to watch first is at the top: WRONG values offered. The aim is zero.
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { callVisionTool, pickProvider, type Part } from "../lib/ai/vision";
import { resizeForVision } from "../lib/fetchAndResizeImage";
import { LABEL_SYSTEM, LABEL_TOOL, METER_SYSTEM, METER_TOOL, labelSchema, meterSchema, normaliseLabel, normaliseMeter } from "../lib/readingAssess";
import { scoreLabel, scoreMeter, summariseReadings, type ReadingCase, type ReadingScore } from "../lib/readingScore";

const DIR = process.env.READING_EVAL_DIR || join(process.cwd(), "reading-eval");
const pc = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);

async function main() {
  const args = process.argv.slice(2);
  const ri = args.indexOf("--runs");
  const runs = ri >= 0 ? Math.max(1, Math.min(10, parseInt(args[ri + 1], 10) || 1)) : 1;
  const provider = pickProvider(undefined);
  if (!provider) throw new Error("No AI key found. Run with: npx tsx@4.23.15 --env-file=.env scripts/eval-reading.ts");
  if (!existsSync(DIR)) throw new Error(`No folder ${DIR}. See reading-eval/README.md`);
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "example.json").sort();
  if (files.length === 0) throw new Error("No case files found in reading-eval/. See reading-eval/README.md");

  const scores: ReadingScore[] = [];
  for (const f of files) {
    let c: ReadingCase;
    try { c = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { console.log(`${f}: not valid JSON, skipped`); continue; }
    if (!c?.name || (c.kind !== "meter" && c.kind !== "label") || !Array.isArray(c.photos) || c.photos.length === 0 || !c.expect) { console.log(`${f}: needs name, kind (meter or label), photos and expect, skipped`); continue; }
    let images: { base64: string; mediaType: string }[];
    try { images = await Promise.all(c.photos.slice(0, 3).map((p) => resizeForVision(readFileSync(join(DIR, p)), 2000))); } catch { console.log(`${c.name}: a photo could not be read, skipped`); continue; }
    const parts: Part[] = images.map((image) => ({ type: "image", image }));
    parts.push({ type: "text", text: c.kind === "meter" ? `Read the meter in ${images.length === 1 ? "this photo" : `these ${images.length} photos (the same meter)`} using the tool.` : `Read the appliance label in ${images.length === 1 ? "this photo" : `these ${images.length} photos`} using the tool.` });
    for (let run = 1; run <= runs; run++) {
      const r = await callVisionTool({ provider, depth: "deep", system: c.kind === "meter" ? METER_SYSTEM : LABEL_SYSTEM, parts, toolName: c.kind === "meter" ? METER_TOOL : LABEL_TOOL, toolDescription: "Report what is clearly visible.", schema: c.kind === "meter" ? meterSchema() : labelSchema(), maxTokens: 700 });
      if (!r.ok) { console.log(`${c.name} run ${run}: the AI failed (${r.error})`); continue; }
      let sc: ReadingScore, said: string;
      if (c.kind === "meter") { const s = normaliseMeter(r.data); sc = scoreMeter(c, s); said = s.reading ? `reading ${s.reading}` : `no reading (${s.partial ? `saw ${s.partial}` : "nothing clear"})`; }
      else { const s = normaliseLabel(r.data); sc = scoreLabel(c, s); said = s.make ? `make ${s.make}` : "nothing offered"; }
      scores.push(sc);
      const flags = [sc.wrongOffered ? "WRONG VALUE OFFERED" : "", sc.serialWrong ? "serial wrong" : "", sc.missed ? "declined (it was readable)" : "", sc.correct ? "correct" : ""].filter(Boolean);
      console.log(`${c.name.padEnd(34).slice(0, 34)} run ${run}: ${said}${flags.length ? ` [${flags.join(", ")}]` : ""}`);
    }
  }
  const sm = summariseReadings(scores);
  console.log("\n=== SUMMARY ===");
  console.log(`Answers scored:                                  ${sm.answers}`);
  console.log(`SAFETY: wrong values OFFERED:                    ${sm.wrongOffered}   (the aim is 0)`);
  console.log(`SAFETY: wrong serial numbers shown:              ${sm.serialWrong}   (the aim is 0)`);
  console.log(`Correct, of the values offered:                  ${pc(sm.correctOfOffered)}`);
  console.log(`Share of photos where a value was offered:       ${pc(sm.offeredShare)}`);
  console.log(`Declined although the photo was readable:        ${sm.missed}   (cautious, not dangerous)`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
