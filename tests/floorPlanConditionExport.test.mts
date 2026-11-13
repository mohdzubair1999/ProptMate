import { readFileSync } from "fs";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const editor = readFileSync("app/dashboard/floor-plans/[propertyId]/floor-plan-editor.tsx", "utf8"), cleanup = readFileSync("lib/floorPlanCleanup.ts", "utf8");
// The condition colours only mean something next to their key, and a shared plan or a report must never show a room's condition. Everything exported or saved is
// made from the LIVE drawing by cleanDrawingForSheet(), which removes editor-only elements, so the colour must be an editor-only overlay, never a room's own fill.
const basePolygon = editor.match(/<polygon\s+points=\{pointsStr\}\s+fill=\{[^}]*\}\s+stroke=\{isOverlapping[^}]*\}/);
ok("the room's own polygon fill does not depend on the condition colour", !!basePolygon && !/conditionFillFor/.test(basePolygon[0]), basePolygon?.[0]);
const overlay = editor.match(/\{!isOverlapping && !roomData\?\.isGarden && conditionFillFor\(room\.name\) && \(\s*<polygon[^>]*\/>/);
ok("the condition colour is drawn as a separate overlay that is editor-only (so the sheet clean-up removes it) and cannot be clicked", !!overlay && /data-editor-only="true"/.test(overlay[0]) && /pointerEvents: "none"/.test(overlay[0]), overlay?.[0]);
ok("the sheet clean-up still removes every editor-only element", /const REMOVE = \[[^\]]*"\[data-editor-only\]"/.test(cleanup));
ok("nothing else in the editor uses the condition colour as a fill", (editor.match(/conditionFillFor\(/g) || []).length === 2, (editor.match(/conditionFillFor\(/g) || []).length);
const measure = editor.match(/\{measureStart && measureEnd && \([\s\S]*?<g className="pointer-events-none"([^>]*)>/);
ok("the Measure tool's drawing is editor-only too (a measurement left showing must never reach an export, a saved plan or a share link)", !!measure && /data-editor-only="true"/.test(measure[1]), measure?.[1]);
ok("every overlay drawn only for the person editing carries data-editor-only: the condition tint and the measurement", (editor.match(/data-editor-only="true"/g) || []).length >= 2);
console.log(`\nEditor-only drawings cannot reach exports or saved plans (source guard): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
