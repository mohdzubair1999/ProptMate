import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, cpSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { reportCompletedDate as R } from "../lib/reportDates";
let pass = 0, fail = 0, skipped = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
// ================= the rule: ONE date, the date the inspection was first completed =================
const FIRST = new Date("2026-11-01T10:00:00Z"), LATEST = new Date("2026-11-20T15:30:00Z");
ok("an inspection that was never amended shows its own completion date", R({ firstCompletedDate: null, completedDate: FIRST })?.getTime() === FIRST.getTime());
ok("an amended inspection STILL shows the date it was first completed, not the latest amendment", R({ firstCompletedDate: FIRST, completedDate: LATEST })?.getTime() === FIRST.getTime());
ok("however many times it is amended, the date does not move (the first date is kept while the latest completion date moves on)", [1, 2, 3, 7].every((k) => R({ firstCompletedDate: FIRST, completedDate: new Date(LATEST.getTime() + k * 86400000) })?.getTime() === FIRST.getTime()));
ok("dates stored as text (ISO) are accepted", R({ firstCompletedDate: "2026-11-01T10:00:00.000Z", completedDate: "2026-11-20T15:30:00.000Z" })?.getTime() === FIRST.getTime());
ok("a damaged first date falls back to the completion date; two damaged dates give no date, never an 'Invalid Date'", R({ firstCompletedDate: "not a date", completedDate: LATEST })?.getTime() === LATEST.getTime() && R({ firstCompletedDate: "nope", completedDate: "also nope" }) === null && R({ firstCompletedDate: new Date("x"), completedDate: null }) === null);
ok("no dates, or junk instead of an inspection, gives no date and never throws", [null, undefined, {}, { firstCompletedDate: null, completedDate: null }, { firstCompletedDate: "", completedDate: "" }, 5, "x", []].every((v) => { try { return R(v as any) === null; } catch { return false; } }));
ok("the answer is always a real Date (or null), and the inspection's own dates are not changed", (() => { const i = { firstCompletedDate: FIRST, completedDate: LATEST }; const r = R(i); return r instanceof Date && !Number.isNaN(r.getTime()) && i.firstCompletedDate === FIRST && i.completedDate === LATEST; })());
// ================= the code: no second date is built or printed anywhere =================
const files = ["lib/actions/reports.ts", "lib/pdf/TemplateReportDocument.tsx", "lib/pdf/InspectionReportDocument.tsx"].map((f) => [f, readFileSync(f, "utf8")] as const);
ok("neither report layout prints an 'Amended' date and the report data has no amended date any more", files.every(([, s]) => !/amendedDate/.test(s) && !/Amended:/.test(s)), files.filter(([, s]) => /amendedDate|Amended:/.test(s)).map(([f]) => f));
ok("both report builders take the date from the one shared rule", (files[0][1].match(/completedDate: reportCompletedDate\(inspection\)/g) || []).length === 2);
const help = readFileSync("app/help/help-content.tsx", "utf8");
ok("the Help guide says the report shows one date only and that there is no separate edited date (and no longer says it shows two)", /shows one date only: Completed/.test(help) && /no separate edited date/.test(help) && !/shows two dates/.test(help));
const pageSrc = readFileSync("app/dashboard/inspections/[id]/page.tsx", "utf8"), editBtn = readFileSync("app/dashboard/inspections/[id]/edit-inspection-button.tsx", "utf8");
ok("the 'Amendment N in progress' banner is gone from the inspection page, and nothing anywhere promises that the report will show two dates", !/amend-banner|in progress/.test(pageSrc) && !/both dates|both that date/.test(pageSrc + editBtn + help) && !/banner reading/.test(help));
// ================= the real PDFs, header text read back =================
const hasText = spawnSync("pdftotext", ["-v"]).status !== null && !spawnSync("pdftotext", ["-v"]).error;
const dir = mkdtempSync(join(tmpdir(), "reportpdf-"));
const mod = join(dir, "esm"); mkdirSync(mod, { recursive: true });
writeFileSync(join(mod, "package.json"), '{"type":"module"}');
writeFileSync(join(mod, "tsconfig.json"), JSON.stringify({ compilerOptions: { jsx: "react-jsx", baseUrl: ".", paths: { "@/*": ["./*"] }, module: "esnext", moduleResolution: "bundler", esModuleInterop: true } }));
cpSync(resolve("lib"), join(mod, "lib"), { recursive: true }); symlinkSync(resolve("node_modules"), join(mod, "node_modules"), "dir");
(globalThis as any).React = React; // the layouts use the app's automatic JSX; the test tool compiles them the classic way, which needs React in scope
const load = async (f: string) => import(pathToFileURL(join(mod, "lib", "pdf", f)).href);
const { TemplateReportDocument } = (await load("TemplateReportDocument.tsx")) as any, { InspectionReportDocument } = (await load("InspectionReportDocument.tsx")) as any;
const text = (buf: Buffer, name: string): string => { const f = join(dir, name + ".pdf"); writeFileSync(f, buf); return spawnSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }).stdout || ""; };
const common = { property: { address: "2 Tudor House", type: "flat", landlordName: null, landlordAddress: null }, type: "check-out", inspector: { name: "Zubair", email: "z@example.com" }, generatedAt: new Date("2026-11-20T16:00:00Z"), companyName: "ZKM Holdings Limited" };
const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; // a one-pixel picture, so the layouts' COVER-PHOTO form is drawn too
const tpl = (completed: Date | null, cover: boolean) => ({ ...common, templateName: "Check Out: 1-Bed Flat", completedDate: completed, sections: [], answers: [], inventoryItems: [], coverPhotoUrl: cover ? PIXEL : null });
const old = (completed: Date | null, cover: boolean) => ({ ...common, status: "completed", scheduledDate: null, completedDate: completed, items: [], coverPhotoUrl: cover ? PIXEL : null });
const render = async (Doc: any, data: any) => (await renderToBuffer(React.createElement(Doc, { data }) as any)) as Buffer;
const amendedCompleted = R({ firstCompletedDate: FIRST, completedDate: LATEST }), plainCompleted = R({ firstCompletedDate: null, completedDate: FIRST });
// Each layout prints the date in TWO forms (a plain header, and over a cover photo): every form of every layout is checked
for (const [label, Doc, mk] of [["template layout", TemplateReportDocument, tpl], ["older layout", InspectionReportDocument, old]] as const) for (const cover of [false, true]) {
  const form = `${label}, ${cover ? "with a cover photo" : "plain header"}`;
  const a = await render(Doc, mk(amendedCompleted, cover)), p = await render(Doc, mk(plainCompleted, cover));
  ok(`${form}: both an amended and a never-amended report render as real PDFs`, a.subarray(0, 5).toString() === "%PDF-" && p.subarray(0, 5).toString() === "%PDF-");
  if (hasText) {
    const ta = text(a, `${label}-${cover}-a`), tp = text(p, `${label}-${cover}-p`);
    ok(`${form}, AMENDED inspection: shows 'Completed: 01/11/2026' (the first date), the word Amended is nowhere in the report, and the latest amendment's date does not appear`, ta.includes("Completed: 01/11/2026") && !/Amended/i.test(ta) && !ta.includes("20/11/2026"), ta.slice(0, 400));
    ok(`${form}, never-amended inspection: the same single 'Completed: 01/11/2026' line, and no Amended`, tp.includes("Completed: 01/11/2026") && !/Amended/i.test(tp));
    ok(`${form}: an amended report's date lines are exactly an unamended one's`, (ta.match(/Completed: \d\d\/\d\d\/\d{4}/g) || []).join() === (tp.match(/Completed: \d\d\/\d\d\/\d{4}/g) || []).join());
    ok(`${form}: the property and the inspector are still shown`, ["2 Tudor House", "Zubair"].every((s) => ta.includes(s)));
  } else { skipped += 4; }
}
if (!hasText) console.log("(pdftotext is not installed here: the checks that read the PDFs' text back were skipped)");
rmSync(dir, { recursive: true, force: true });
console.log(`\nOne date on a report, however often it was amended: ${pass} passed, ${fail} failed${skipped ? ` (${skipped} skipped: no pdftotext)` : ""}`); process.exit(fail ? 1 : 0);
