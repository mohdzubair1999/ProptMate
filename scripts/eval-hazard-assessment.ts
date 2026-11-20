// Measures the damp and mould assistant on photos whose truth you know. Nothing is saved or uploaded to ProptMate.
//
//   npx tsx@4.23.15 --env-file=.env scripts/eval-hazard-assessment.ts [--runs 3]
//
// Put sets in hazard-eval/ (see hazard-eval/README.md). The numbers to watch first are the SAFETY ones at the top: problems rated
// less seriously than they are, and all-clears given for a real problem. For a safety tool the aim is ZERO of both.
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { callVisionTool, pickProvider, type Part } from "../lib/ai/vision";
import { resizeForVision } from "../lib/fetchAndResizeImage";
import { HAZARD_TOOL, buildHazardPrompt, hazardSchema, normaliseHazard } from "../lib/hazardAssess";
import { DEFAULT_SEVERITY, scoreHazard, summariseHazard, type HazardCase, type HazardCaseScore } from "../lib/hazardScore";

const DIR = process.env.HAZARD_EVAL_DIR || join(process.cwd(), "hazard-eval");
const pc = (v: number | null) => (v === null ? "n/a" : `${Math.round(v * 100)}%`);

async function main() {
  const args = process.argv.slice(2);
  const ri = args.indexOf("--runs");
  const runs = ri >= 0 ? Math.max(1, Math.min(10, parseInt(args[ri + 1], 10) || 1)) : 1;
  const provider = pickProvider(undefined);
  if (!provider) throw new Error("No AI key found. Run with: npx tsx@4.23.15 --env-file=.env scripts/eval-hazard-assessment.ts");
  if (!existsSync(DIR)) throw new Error(`No folder ${DIR}. See hazard-eval/README.md`);
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "example.json").sort();
  if (files.length === 0) throw new Error("No case files found in hazard-eval/. See hazard-eval/README.md");

  const scores: HazardCaseScore[] = [];
  for (const f of files) {
    let c: HazardCase;
    try { c = JSON.parse(readFileSync(join(DIR, f), "utf8")); } catch { console.log(`${f}: not valid JSON, skipped`); continue; }
    if (!c?.name || !Array.isArray(c.photos) || c.photos.length === 0 || !c.expect) { console.log(`${f}: needs name, photos and expect, skipped`); continue; }
    const opts = c.severityOptions?.length ? c.severityOptions : DEFAULT_SEVERITY;
    let current: { base64: string; mediaType: string }[], past: { base64: string; mediaType: string }[] = [];
    try {
      current = await Promise.all(c.photos.slice(0, 6).map((p) => resizeForVision(readFileSync(join(DIR, p)))));
      if (c.previousPhotos?.length) past = await Promise.all(c.previousPhotos.slice(0, 3).map((p) => resizeForVision(readFileSync(join(DIR, p)), 1024)));
    } catch { console.log(`${c.name}: a photo could not be read, skipped`); continue; }
    const prompt = buildHazardPrompt({ sectionTitle: "Health & safety review - damp and mould", severityOptions: opts, previous: past.length ? { date: c.previous?.date ?? null, severity: c.previous?.severity ?? null, extent: c.previous?.extent ?? null, photoCount: past.length } : null, currentCount: current.length });
    const parts: Part[] = [];
    if (past.length) { parts.push({ type: "text", text: `PREVIOUS visit photos (${past.length}):` }); for (const image of past) parts.push({ type: "image", image }); }
    parts.push({ type: "text", text: `CURRENT photos (${current.length}):` });
    for (const image of current) parts.push({ type: "image", image });
    parts.push({ type: "text", text: prompt.userText });
    for (let run = 1; run <= runs; run++) {
      const r = await callVisionTool({ provider, depth: "standard", system: prompt.system, parts, toolName: HAZARD_TOOL, toolDescription: prompt.toolDescription, schema: hazardSchema(opts), maxTokens: 1100 });
      if (!r.ok) { console.log(`${c.name} run ${run}: the AI failed (${r.error})`); continue; }
      const s = normaliseHazard(r.data, { severityOptions: opts, signsOptions: ["Yes", "No"], currentSeverity: null, hadPrevious: past.length > 0 });
      const sc = scoreHazard(c, s);
      scores.push(sc);
      const bits = [`signs ${s.signsRaw}`, `severity ${s.severity ?? "none suggested"}`, `${s.confidence} confidence`];
      if (sc.underRated) bits.push("UNDER-RATED (less serious than the truth)");
      if (sc.allClearOnProblem) bits.push("ALL-CLEAR ON A REAL PROBLEM");
      if (s.trend) bits.push(`trend ${s.trend.change}`);
      console.log(`${c.name.padEnd(36).slice(0, 36)} run ${run}: ${bits.join(", ")}`);
    }
  }
  const sm = summariseHazard(scores);
  console.log("\n=== SUMMARY ===");
  console.log(`Answers scored:                                ${sm.cases}`);
  console.log(`SAFETY: rated less seriously than the truth:   ${sm.underRated}   (the aim is 0)`);
  console.log(`SAFETY: all-clear given for a real problem:    ${sm.allClearOnProblem}   (the aim is 0)`);
  console.log(`Signs of damp or mould judged correctly:       ${pc(sm.signsRight)}`);
  console.log(`Severity exactly right (when given):           ${pc(sm.severityExact)}`);
  console.log(`Held back with no severity suggested:         ${pc(sm.abstained)}   (a cautious answer, not a mistake)`);
  console.log(`Trend since the last visit right:              ${pc(sm.trendRight)}`);
  console.log(`Sentences removed by the safety rules:         ${sm.warnings}`);
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
