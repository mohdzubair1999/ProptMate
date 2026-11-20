import { analysePhotos, COVERAGE_RULE, buildPrompts } from "../lib/photoAnalysis";
import { AUDIT_SYSTEM, REPORT_SYSTEM, DETAIL_SYSTEM, MISSED_ITEMS_CHECKLIST, mergeAdditions, normaliseDetails, auditBrief } from "../lib/photoDetails";
import { findWordingBreaches } from "../lib/photoWording";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 400) : JSON.stringify(x).slice(0, 400))); };
console.error = () => {};
const IMG = { base64: "AAAA", mediaType: "image/jpeg" };
const FIRST = { items: [{ name: "Walls", colour_finish: "white emulsion", condition: "good", observations: [], cleanliness: "clean" }, { name: "Radiator", colour_finish: "white", observations: [], cleanliness: "clean", no_defect_visible: true }], defects: [] };
const MISSED = { items: [{ name: "Double socket", colour_finish: "white", quantity: 2, observations: ["Scuff around the lower socket"], cleanliness: "clean" }, { name: "Walls", colour_finish: "white emulsion", observations: [], cleanliness: "clean" }], defects: [{ type: "mould", item: "Ceiling", location: "corner by the window", extent: "small area of black spotting", confidence: "high" }] };
type Call = { system: string; isAudit: boolean; text: string; images: number };
const mk = (status: number, json: any) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => json, text: async () => JSON.stringify(json) });
const run = async (o: any = {}, audit: any = MISSED, auditMode: "ok" | "500" | "empty" | "hang" = "ok") => {
  const calls: Call[] = [];
  const fetchImpl: any = async (_u: any, init: any) => {
    const body = JSON.parse(init.body); const isAudit = body.system === AUDIT_SYSTEM; const content = body.messages[0].content;
    calls.push({ system: body.system, isAudit, text: content.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n"), images: content.filter((p: any) => p.type === "image").length });
    if (isAudit) { if (auditMode === "500") return mk(500, {}); if (auditMode === "hang") return new Promise(() => {}); return mk(200, { stop_reason: "tool_use", content: [{ type: "tool_use", name: "report_observations", input: auditMode === "empty" ? { items: [], defects: [] } : audit }] }); }
    return mk(200, { stop_reason: "tool_use", content: [{ type: "tool_use", name: "report_observations", input: FIRST }] });
  };
  const r: any = await analysePhotos({ images: [IMG], provider: "anthropic", deep: true, detailed: true, report: true, style: "bullets", allowRecommendations: false, keys: { anthropic: "k" }, fetchImpl, sleep: async () => {}, ...o });
  return { r, calls };
};
// ---------- the prompts ----------
for (const [n, s] of [["report", REPORT_SYSTEM], ["detail list", DETAIL_SYSTEM], ["second look", AUDIT_SYSTEM]] as const) ok(`the ${n} instructions carry the missed-items checklist`, s.includes(MISSED_ITEMS_CHECKLIST) && /SMALL MARKS/.test(s) && /ITEMS:/.test(s) && /meter readings/.test(s) && /mould/.test(s));
ok("the checklist breaks no wording rule (no advice, no 'not tested') and never asks the AI to invent", findWordingBreaches(MISSED_ITEMS_CHECKLIST, { allowRecommendations: false }).length === 0 && /Do not invent anything/.test(MISSED_ITEMS_CHECKLIST));
ok("the second-look prompt asks ONLY for what is missing, never to repeat, empty lists when complete", /ONLY job is to find what the list MISSED/.test(AUDIT_SYSTEM) && /Do not repeat anything/.test(AUDIT_SYSTEM) && /return empty lists/.test(AUDIT_SYSTEM));
ok("Quick and Deep (the plain description) now also look for small marks, fittings, mould and readings", /nothing small is left out/.test(COVERAGE_RULE) && /mould or damp spotting/.test(COVERAGE_RULE) && /meter reading/.test(COVERAGE_RULE) && findWordingBreaches(COVERAGE_RULE, { allowRecommendations: false }).length === 0 && /nothing small is left out/.test(buildPrompts({ identifyRoom: false, allowRecommendations: false, imageCount: 1, referenceImages: [], coverage: true }).systemPrompt));
// ---------- the second look ----------
let { r, calls } = await run({ audit: true });
ok("with audit on: two calls, the second is the second look with the photo and the list of what is already there", r.ok && calls.length === 2 && calls[1].isAudit && calls[1].images === 1 && /ITEMS ALREADY LISTED: Walls; Radiator/.test(calls[1].text), calls.map((c) => c.isAudit));
ok("what the first list MISSED is added to the report (socket with its scuff, and the mould on the ceiling)", r.ok && /Double socket/i.test(r.description) && /Scuff around the lower socket/.test(r.description) && /mould|black spotting/i.test(r.description), r.ok ? r.description : r);
ok("what was already listed is not added twice (Walls appears once)", r.ok && (r.description.match(/white emulsion walls/gi) || []).length === 1, r.ok ? r.description : r);
ok("the result says how many were added (a socket, and the mould)", r.ok && r.auditAdded === 2, r.auditAdded);
({ r, calls } = await run({}));
ok("audit not asked for: exactly one call, as before, nothing added", r.ok && calls.length === 1 && !r.auditAdded);
({ r, calls } = await run({ audit: true }, MISSED, "500"));
ok("if the second look FAILS, the first list is still the report (never an error)", r.ok && /Walls/.test(r.description) && !/socket/i.test(r.description) && r.auditAdded === 0);
({ r, calls } = await run({ audit: true }, MISSED, "empty"));
ok("if the second look finds nothing, the report is unchanged", r.ok && r.auditAdded === 0 && !/socket/i.test(r.description));
const t0 = Date.now(); ({ r, calls } = await run({ audit: true, budgetMs: 21_000, now: (() => { let t = 0; return () => (t += 600); })() }, MISSED, "hang"));
ok(`if the second look HANGS it is abandoned inside the time budget (${Date.now() - t0} ms) and the first list stands`, r.ok && r.auditAdded === 0 && Date.now() - t0 < 25_000);
({ r, calls } = await run({ audit: true, budgetMs: 15_000 }));
ok("with too little time left the second look is skipped, not rushed", r.ok && calls.length === 1);
({ r, calls } = await run({ audit: true }, { items: [{ name: "Tap", observations: ["Tap should be replaced", "Not tested"], cleanliness: "clean" }], defects: [] }));
ok("advice or 'not tested' found by the second look is dropped like any other", r.ok && !/should|replaced|not tested/i.test(r.description));
// ---------- the merge itself ----------
const base = normaliseDetails(FIRST, { allowRecommendations: false });
const m = mergeAdditions(base, normaliseDetails(MISSED, { allowRecommendations: false }));
ok("merge: adds the new item and defect, skips the repeated Walls, keeps the first list intact and in order", m.addedItems === 1 && m.addedDefects === 1 && m.details.items.map((i) => i.name).join() === "Walls,Radiator,Double socket" && base.items.length === 2);
ok("merge: adding the same extras again adds nothing (idempotent)", (() => { const again = mergeAdditions(m.details, normaliseDetails(MISSED, { allowRecommendations: false })); return again.addedItems === 0 && again.addedDefects === 0; })());
ok("merge: junk in, nothing breaks", (() => { const x = mergeAdditions(base, normaliseDetails("junk", { allowRecommendations: false })); return x.addedItems === 0 && x.details.items.length === 2; })());
ok("the brief names every item and defect already listed, in a bounded length", auditBrief(m.details).includes("Double socket") && auditBrief(m.details).includes("mould on Ceiling") && auditBrief({ ...m.details, items: Array.from({ length: 30 }, (_, i) => ({ ...m.details.items[0], name: "x".repeat(300) + i })) }).length <= 5000);
// ---------- the route turns it on, and crops by default ----------
const route = readFileSync("app/api/ai/analyze-photo/route.ts", "utf8");
ok("the route asks for the second look in report mode unless AI_DETAILED_AUDIT=0", /audit: reportMode && process\.env\.AI_DETAILED_AUDIT !== "0"/.test(route));
ok("close-up crops are on by default for Detailed (AI_DETAILED_CROPS=0 turns them off)", /const wantCrops = detailed && process\.env\.AI_DETAILED_CROPS !== "0"/.test(route));
console.log(`\nPhoto second look: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
