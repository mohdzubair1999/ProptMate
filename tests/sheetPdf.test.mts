import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync, copyFileSync, symlinkSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildSheet, type SheetInput } from "../lib/floorPlanSheet";
import type { SheetKey } from "../lib/floorPlanKey";
import { SYMBOL_KINDS, SYMBOLS } from "../lib/floorPlanObjects";
let pass = 0, fail = 0, skipped = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
// A real PDF is made from a real sheet, then read back. Reading the text back needs the `pdftotext` command (part of poppler); without it those checks are skipped, and said to be.
const hasText = spawnSync("pdftotext", ["-v"]).status !== null && !spawnSync("pdftotext", ["-v"]).error;
const dir = mkdtempSync(join(tmpdir(), "sheetpdf-"));
// The PDF library only offers an ES-module entry point, and this project's own .tsx files are loaded in the older style by the test tool, so loading SheetPdf.tsx
// directly fails here (the app itself is built differently and is fine). So the REAL, current SheetPdf.tsx is copied, at test time, into a temporary folder marked
// as ES modules and loaded from there.
const mod = join(dir, "esm"); mkdirSync(join(mod, "lib", "pdf"), { recursive: true });
writeFileSync(join(mod, "package.json"), '{"type":"module"}');
for (const f of ["lib/pdf/SheetPdf.tsx", "lib/logoImage.ts", "lib/svgSanitize.ts"]) copyFileSync(resolve(f), join(mod, f));
symlinkSync(resolve("node_modules"), join(mod, "node_modules"), "dir");
const { SheetPdf } = (await import(pathToFileURL(join(mod, "lib", "pdf", "SheetPdf.tsx")).href)) as { SheetPdf: any };
const text = (buf: Buffer, name: string): string => { const f = join(dir, name + ".pdf"); writeFileSync(f, buf); const r = spawnSync("pdftotext", ["-layout", f, "-"], { encoding: "utf8" }); return r.stdout || ""; };
const pages = (buf: Buffer, name: string): number => { const f = join(dir, name + ".pdf"); writeFileSync(f, buf); const r = spawnSync("pdfinfo", [f], { encoding: "utf8" }); const m = /Pages:\s+(\d+)/.exec(r.stdout || ""); return m ? Number(m[1]) : -1; };
const SERVICES = SYMBOL_KINDS.filter((k) => SYMBOLS[k].group === "Safety and services");
const inp = (over: Partial<SheetInput> = {}): SheetInput => ({ innerSvg: '<g transform="translate(10,10)"><polygon points="0,0 200,0 200,160 0,160" stroke="#25344A" stroke-width="1.5" fill="#E7F0EC"/><text x="100" y="80" font-size="11" text-anchor="middle" fill="#25344A">Lounge</text><circle cx="30" cy="30" r="6" fill="#FFFFFF" stroke="#8B7355"/></g>', pxPerMetre: 40, originPx: 10, footprint: { minX: 0, minY: 0, maxX: 5, maxY: 4 }, rooms: [{ name: "Lounge", widthM: 5, lengthM: 4, areaM2: 20 }], title: { address: "12 Example Road", floorName: "Ground floor", company: "ZKM", date: new Date("2026-06-30T12:00:00Z") }, ...over });
const KEY: SheetKey = { symbols: ["smoke-alarm", "co-alarm", "stopcock"], notes: [{ n: 1, text: "Damp patch behind the sofa" }, { n: 2, text: "Cracked tile by the door" }] };
const render = async (sheet: ReturnType<typeof buildSheet>) => (await renderToBuffer(React.createElement(SheetPdf, { svg: sheet.svg, widthMm: sheet.widthMm, heightMm: sheet.heightMm, title: "Floor plan" }) as any)) as Buffer;
const withKey = buildSheet(inp({ key: KEY })), noKey = buildSheet(inp());
const pdf = await render(withKey), pdfNo = await render(noKey);
ok("a real PDF is made: it starts with %PDF- and ends with %%EOF, and is a sensible size", pdf.subarray(0, 5).toString() === "%PDF-" && pdf.subarray(-8).toString().includes("%%EOF") && pdf.length > 2000 && pdf.length < 2_000_000, pdf.length);
ok("it is one page", pages(pdf, "key") === 1 || !hasText);
if (hasText) {
  const t = text(pdf, "key");
  ok("the PDF's own text has the title block, the room schedule and its total", ["ZKM", "12 Example Road", "Ground floor", "Room schedule", "Lounge", "Total approx. gross internal area"].every((s) => t.includes(s)), t.slice(0, 300));
  ok("THE KEY IS IN THE PDF: its heading, the names of the safety symbols used, and both pin notes", ["Key", "Smoke alarm", "Carbon monoxide alarm", "Stopcock", "Damp patch behind the sofa", "Cracked tile by the door"].every((s) => t.includes(s)), t.slice(-700));
  ok("without a key there is no Key block in the PDF (and no notes)", !/\bKey\b/.test(text(pdfNo, "nokey")) && !text(pdfNo, "nokey").includes("Damp patch"));
  const hostile = buildSheet(inp({ key: { symbols: [], notes: [{ n: 1, text: "<script>alert(1)</script> & \"quoted\"" }] } })); const th = text(await render(hostile), "hostile");
  ok("a note with markup in it is printed as plain words, exactly, and nothing runs", th.includes("<script>alert(1)</script>") && th.includes("& \"quoted\""), th.slice(-300));
  const withLayers = buildSheet(inp({ key: { symbols: ["smoke-alarm"], notes: [{ n: 1, text: "Damp patch behind the sofa" }], layers: [{ name: "Electrics", colour: "#DC2626" }, { name: "Gas pipes", colour: "#2563EB" }] } })); const pl = await render(withLayers), tl = text(pl, "layers");
  ok("THE LAYERS ARE IN THE PDF: each coloured layer's name is printed in the key, with the symbols and the pin note, all on one page, and the disclaimer is still there under them", ["Key", "Electrics", "Gas pipes", "Smoke alarm", "Damp patch behind the sofa", "illustrative purposes"].every((s) => tl.includes(s)) && (pages(pl, "layers") === 1), tl.slice(-500));
  const big = buildSheet(inp({ key: { symbols: SERVICES.slice(0, 12), notes: Array.from({ length: 30 }, (_, i) => ({ n: i + 1, text: `Defect number ${i + 1} noted here` })) } })); const tb = text(await render(big), "big");
  ok("the biggest possible key (12 symbols, 30 notes) prints completely: the first and the LAST note are both in the PDF, on one page", tb.includes("Defect number 1 noted here") && tb.includes("Defect number 30 noted here") && pages(await render(big), "big2") === 1, [big.paper, big.scale]);
  const bw = text(await render(buildSheet(inp({ key: KEY, style: "bw" }))), "bw"); ok("black and white prints the key too", bw.includes("Smoke alarm") && bw.includes("Damp patch behind the sofa"));
} else { skipped += 6; console.log("(pdftotext is not installed here: the 6 checks that read the PDF's text back were skipped)"); }
const raw = pdf.toString("latin1");
ok("the PDF holds nothing active: no JavaScript, no automatic action, no launch, no link", !/\/JavaScript|\/JS\b|\/OpenAction|\/Launch|\/URI|\/AA\b|\/EmbeddedFile/.test(raw));
const rawHostile = (await render(buildSheet(inp({ key: { symbols: [], notes: [{ n: 1, text: "<script>alert(1)</script> /JavaScript /OpenAction" }] } })))).toString("latin1");
ok("even a note that spells out those PDF words cannot make the PDF active (they are only printed text)", !/\/S\s*\/JavaScript|\/OpenAction\s*\d|\/Launch|\/URI/.test(rawHostile));
for (const [paper, orientation] of [["A4", "portrait"], ["A4", "landscape"], ["A3", "portrait"], ["A3", "landscape"]] as const) { const s = buildSheet(inp({ key: KEY, paper, orientation })); const b = await render(s); ok(`${paper} ${orientation} with a key renders to a valid single-page PDF`, b.subarray(0, 5).toString() === "%PDF-" && (!hasText || pages(b, `p${paper}${orientation}`) === 1)); }
ok("a damaged key (unknown symbol names) still gives a PDF (the bad names are skipped)", (await render(buildSheet(inp({ key: { symbols: ["nonsense" as any, "smoke-alarm"], notes: [] } })))).subarray(0, 5).toString() === "%PDF-");
rmSync(dir, { recursive: true, force: true });
console.log(`\nThe plan sheet as a real PDF: ${pass} passed, ${fail} failed${skipped ? ` (${skipped} skipped: no pdftotext)` : ""}`); process.exit(fail ? 1 : 0);
