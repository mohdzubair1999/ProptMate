import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDxf as P, dxfToPlanObjects as T, MAX_DXF_LABELS, MAX_DXF_CHARS } from "../lib/dxfImport";
import { svgToDxf } from "../lib/svgToDxf";
import { objectToSvg, MAX_OBJECTS, type PlanObject } from "../lib/floorPlanObjects";
let pass = 0, fail = 0, skipped = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 500))); };
const near = (a: number, b: number, e = 0.0015) => Math.abs(a - b) < e;
const walls = (o: PlanObject[]) => o.filter((x) => x.kind === "wall") as any[]; const labels = (o: PlanObject[]) => o.filter((x) => x.kind === "label") as any[];
const has = (ws: any[], x1: number, y1: number, x2: number, y2: number) => ws.some((w) => (near(w.x1, x1) && near(w.y1, y1) && near(w.x2, x2) && near(w.y2, y2)) || (near(w.x1, x2) && near(w.y1, y2) && near(w.x2, x1) && near(w.y2, y1)));
// ---------- files made by an independent DXF library (ezdxf) ----------
const dir = mkdtempSync(join(tmpdir(), "dxfimp-"));
const py = (script: string) => spawnSync("python3", ["-c", script, dir], { encoding: "utf8" });
const have = py("import ezdxf").status === 0;
if (have) {
  const mk = py(`
import ezdxf, sys, os
d = sys.argv[1]
doc = ezdxf.new("R2010", setup=True); doc.header["$INSUNITS"] = 4; m = doc.modelspace()
m.add_lwpolyline([(0,0),(5000,0),(5000,4000),(0,4000)], close=True, dxfattribs={"layer": "WALLS"})
m.add_line((1000,0),(1000,2000), dxfattribs={"layer": "WALLS"})
m.add_line((1000,0),(1000,2000), dxfattribs={"layer": "WALLS"})
m.add_line((0,0),(0.01,0))
m.add_text("Lounge", dxfattribs={"insert": (2500,2000), "height": 200, "rotation": 30})
m.add_mtext("{\\\\fArial|b0;Hall}\\\\Pnext", dxfattribs={"insert": (500,3500), "char_height": 150})
m.add_circle((3000,1000), 300); m.add_arc((3000,1000), 500, 0, 90)
doc.saveas(os.path.join(d, "r2010.dxf"))
doc = ezdxf.new("R12"); m = doc.modelspace(); m.add_polyline2d([(0,0),(6,0),(6,3)], close=False); m.add_polyline2d([(10,10),(12,10),(12,12)], close=True)
doc.saveas(os.path.join(d, "r12.dxf"))
doc = ezdxf.new("R2010"); m = doc.modelspace(); m.add_lwpolyline([(0,0),(900,0),(900,500),(0,500)], close=True); doc.saveas(os.path.join(d, "nounits.dxf"))
`);
  ok("(the test files were made by ezdxf)", mk.status === 0, mk.stderr);
  const r = P(readFileSync(join(dir, "r2010.dxf"), "utf8"));
  ok("an AutoCAD-style (R2010) file is read: one closed polyline, two identical lines (kept as read), tiny line, text, formatted text, units in millimetres; circles and arcs are counted as skipped", r.insunits === 4 && r.entities.filter((e) => e.type === "POLY").length === 1 && r.entities.filter((e) => e.type === "LINE").length === 3 && r.entities.filter((e) => e.type === "TEXT").length === 2 && r.skipped.CIRCLE === 1 && r.skipped.ARC === 1, [r.insunits, r.entities.map((e) => e.type), r.skipped]);
  const c = T(r); const ws = walls(c.objects), ls = labels(c.objects);
  ok("converted: the units come from the file (mm, not guessed), the size is 5 m by 4 m, and nothing is reported as an error", c.stats.unit === "mm" && c.stats.unitGuessed === false && near(c.stats.widthM, 5) && near(c.stats.heightM, 4) && !c.stats.error, c.stats);
  ok("five walls: the four sides of the closed polyline (closing side included) and the one line; the repeated line and the 0.01 mm line are left out", ws.length === 5 && c.stats.walls === 5, ws.length);
  ok("north is up: the drawing's bottom edge (y 0) is at the BOTTOM of the plan (y 4.5) and its top edge at the top (y 0.5), moved in by half a metre", has(ws, 0.5, 4.5, 5.5, 4.5) && has(ws, 0.5, 0.5, 5.5, 0.5) && has(ws, 0.5, 0.5, 0.5, 4.5) && has(ws, 5.5, 0.5, 5.5, 4.5) && has(ws, 1.5, 4.5, 1.5, 2.5), ws.map((w) => [w.x1, w.y1, w.x2, w.y2]));
  ok("two labels: 'Lounge' in the middle of the room (3.0, 2.5), turned the way it was (30 degrees anticlockwise is 330 on the plan), and 'Hall next' with its formatting codes removed", ls.length === 2 && ls.some((l) => l.text === "Lounge" && near(l.x, 3) && near(l.y, 2.5) && l.rot === 330) && ls.some((l) => l.text === "Hall next"), ls);
  ok("every object is valid for the plan: walls 0.1 m thick, nothing off the top or left, labels short", c.objects.every((o: any) => o.kind === "wall" ? o.t === 0.1 && o.x1 >= 0 && o.y1 >= 0 && o.x2 >= 0 && o.y2 >= 0 : o.x >= 0 && o.y >= 0 && o.text.length <= 80));
  const r12 = P(readFileSync(join(dir, "r12.dxf"), "utf8")), c12 = T(r12);
  ok("an old-style (R12) file with POLYLINE and VERTEX is read too: an open one (2 sides) and a closed one (3 sides) = 5 walls, no units in the file so it is guessed (as metres, from its size) and says so", r12.entities.filter((e) => e.type === "POLY").length === 2 && walls(c12.objects).length === 5 && c12.stats.unit === "m" && c12.stats.unitGuessed === true, [r12.entities.length, c12.stats]);
  const nu = T(P(readFileSync(join(dir, "nounits.dxf"), "utf8")));
  ok("a file that does not say its units, 900 across: guessed as centimetres (9 m), and it says it guessed", nu.stats.unit === "cm" && nu.stats.unitGuessed && near(nu.stats.widthM, 9), nu.stats);
  const forced = T(P(readFileSync(join(dir, "nounits.dxf"), "utf8")), { unit: "mm" });
  ok("the person can choose the units: told millimetres, the same file is 0.9 m across, and it is not 'guessed'", near(forced.stats.widthM, 0.9) && forced.stats.unitGuessed === false && forced.stats.unit === "mm", forced.stats);
} else { skipped += 8; console.log("(python3 with ezdxf is not installed here: the checks on files made by ezdxf were skipped)"); }
rmSync(dir, { recursive: true, force: true });
// ---------- our own exporter, and back ----------
{ const o: PlanObject[] = [{ id: "a", kind: "wall", x1: 1, y1: 1, x2: 6, y2: 1, t: 0.1 }, { id: "b", kind: "wall", x1: 6, y1: 1, x2: 6, y2: 5, t: 0.1 }, { id: "l", kind: "label", x: 3, y: 3, text: "Kitchen", size: 12, rot: 0 }];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">${o.map((x) => objectToSvg(x)).join("")}</svg>`;
  const dxf = svgToDxf(svg, { pxPerMetre: 40, originPx: 10 }); const back = T(P(dxf)); const bw = walls(back.objects);
  ok("A ROUND TRIP: a plan exported by this app and imported again comes back with the same shapes (a 5 m wall and a 4 m wall that meet at a corner) and its label", bw.length >= 2 && bw.some((w) => near(Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 5, 0.003)) && bw.some((w) => near(Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 4, 0.003)) && labels(back.objects).some((l) => l.text === "Kitchen"), [bw.length, back.stats]);
  const long = bw.find((w) => near(Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 5, 0.003)), tall = bw.find((w) => near(Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 4, 0.003));
  ok("...and they still meet: the end of the long wall is the start of the upright one, and the upright one runs DOWN the plan from it", !!long && !!tall && [[long.x1, long.y1], [long.x2, long.y2]].some(([x, y]) => [[tall.x1, tall.y1], [tall.x2, tall.y2]].some(([u, v]) => near(x, u) && near(y, v))) && near(Math.abs(tall.y2 - tall.y1), 4, 0.003), [long, tall]); }
// ---------- the rules, on hand-made files ----------
const dx = (...pairs: [number, string | number][]) => pairs.map(([c, v]) => `${c}\n${v}`).join("\n") + "\n";
const wrap = (entities: string, header = "") => dx([0, "SECTION"], [2, "HEADER"]) + header + dx([0, "ENDSEC"], [0, "SECTION"], [2, "ENTITIES"]) + entities + dx([0, "ENDSEC"], [0, "EOF"]);
const line = (x1: number, y1: number, x2: number, y2: number, layer = "0") => dx([0, "LINE"], [8, layer], [10, x1], [20, y1], [30, 0], [11, x2], [21, y2], [31, 0]);
ok("a plain LINE is read, with its layer", (() => { const p = P(wrap(line(0, 0, 4, 0, "WALLS"))); return p.entities.length === 1 && p.entities[0].type === "LINE" && p.entities[0].layer === "WALLS"; })());
ok("units from the file ($INSUNITS 4 mm, 5 cm, 6 m) are honoured, and an unknown code (1 = inches) is ignored in favour of the size guess", (() => { const f = (u: number) => T(P(wrap(line(0, 0, 4, 0) + line(0, 0, 0, 3), dx([9, "$INSUNITS"], [70, u])))).stats; return f(4).unit === "mm" && f(5).unit === "cm" && f(6).unit === "m" && f(99).unitGuessed === true; })());
ok("without units, the guess follows the size: 5000 across is mm, 1000 is cm, 10 is m", T(P(wrap(line(0, 0, 5000, 0)))).stats.unit === "mm" && T(P(wrap(line(0, 0, 1000, 0)))).stats.unit === "cm" && T(P(wrap(line(0, 0, 10, 0)))).stats.unit === "m");
ok("a drawing that would be over 150 m across in a unit the PERSON chose is refused with a message that says to choose a different unit, and nothing is imported", (() => { const r = T(P(wrap(line(0, 0, 500, 0))), { unit: "m" }); return r.objects.length === 0 && /choose a different unit/.test(r.stats.error ?? "") && r.stats.widthM === 500 && T(P(wrap(line(0, 0, 500, 0))), { unit: "cm" }).objects.length === 1; })());
ok("but when the FILE says metres and that would be absurd (a template's default unit, 500 across), it goes by the drawing's size instead (centimetres, 5 m) and says it guessed; when the file's unit is sensible it is trusted", (() => { const bad = T(P(wrap(line(0, 0, 500, 0), dx([9, "$INSUNITS"], [70, 6])))), good = T(P(wrap(line(0, 0, 5, 0), dx([9, "$INSUNITS"], [70, 6])))); return bad.stats.unit === "cm" && bad.stats.unitGuessed === true && bad.objects.length === 1 && good.stats.unit === "m" && good.stats.unitGuessed === false; })());
ok("an open polyline gives one wall per side, a closed one gets its closing side too", (() => { const o = P(wrap(dx([0, "LWPOLYLINE"], [8, "0"], [70, 0], [90, 3], [10, 0], [20, 0], [10, 3], [20, 0], [10, 3], [20, 2]))), c = P(wrap(dx([0, "LWPOLYLINE"], [8, "0"], [70, 1], [90, 3], [10, 0], [20, 0], [10, 3], [20, 0], [10, 3], [20, 2]))); return walls(T(o).objects).length === 2 && walls(T(c).objects).length === 3; })());
ok("the same line twice (either way round), a line under 5 cm, and a line with no length are all left out", walls(T(P(wrap(line(0, 0, 4, 0) + line(4, 0, 0, 0) + line(0, 0, 0.04, 0) + line(2, 2, 2, 2) + line(0, 0, 0, 3)))).objects).length === 2);
ok("text: the position, the formatting removed from MTEXT ({\\fArial;Hall}\\Pnext becomes 'Hall next'), %%d-style codes removed from TEXT, empty text skipped", (() => { const p = P(wrap(dx([0, "TEXT"], [8, "0"], [10, 1], [20, 1], [40, 2], [1, "Bed 1 %%u"], [50, 0]) + dx([0, "MTEXT"], [8, "0"], [10, 2], [20, 2], [40, 2], [1, "{\\fArial|b0;Hall}\\Pnext"]) + dx([0, "TEXT"], [8, "0"], [10, 3], [20, 3], [40, 2], [1, "   "]))); const l = labels(T(p).objects); return l.length === 2 && l.some((x) => x.text === "Bed 1") && l.some((x) => x.text === "Hall next"); })());
ok("a text with an anticlockwise turn of 90 is 270 on the plan, and 0 stays 0, -30 becomes 30", (() => { const t = (rot: number) => labels(T(P(wrap(line(0, 0, 4, 0) + dx([0, "TEXT"], [8, "0"], [10, 1], [20, 1], [40, 2], [1, "A"], [50, rot])))).objects)[0].rot; return t(90) === 270 && t(0) === 0 && t(-30) === 30; })());
ok("too many lines: only the longest 400 minus the labels are kept, and it says how many were left out", (() => { const ents = Array.from({ length: 600 }, (_, i) => line(0, i * 0.1, 1 + i * 0.01, i * 0.1)).join(""); const r = T(P(wrap(ents, dx([9, "$INSUNITS"], [70, 6])))); const ws = walls(r.objects); return ws.length === MAX_OBJECTS && r.stats.truncated === 200 && Math.min(...ws.map((w) => Math.hypot(w.x2 - w.x1, w.y2 - w.y1))) >= 1 + 200 * 0.01 - 0.0016; })());
ok("room already used on the floor is respected: with room for 50 more, no more than 50 are made", (() => { const ents = Array.from({ length: 200 }, (_, i) => line(0, i * 0.1, 1, i * 0.1)).join(""); const r = T(P(wrap(ents, dx([9, "$INSUNITS"], [70, 6]))), { room: 50 }); return r.objects.length === 50 && r.stats.truncated === 150; })());
ok("labels are capped at 100, and walls are never starved of room by them", (() => { const ents = line(0, 0, 4, 0) + Array.from({ length: 150 }, (_, i) => dx([0, "TEXT"], [8, "0"], [10, i], [20, 1], [40, 1], [1, `T${i}`])).join(""); const r = T(P(wrap(ents, dx([9, "$INSUNITS"], [70, 6])))); return labels(r.objects).length === MAX_DXF_LABELS && walls(r.objects).length === 1; })());
ok("an ordinary Windows file (CRLF line ends, stray blank lines, spaces around values) reads the same", walls(T(P(wrap(line(0, 0, 4, 0) + line(0, 0, 0, 3)).replace(/\n/g, "\r\n"))).objects).length === 2 && walls(T(P(wrap(line(0, 0, 4, 0)).split("\n").map((l) => ` ${l} `).join("\n"))).objects).length === 1);
ok("blocks (symbols inserted from a library) are not read, and are counted as skipped", (() => { const f = dx([0, "SECTION"], [2, "BLOCKS"], [0, "BLOCK"], [2, "DOOR"], [0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, 1], [21, 0], [0, "ENDBLK"], [0, "ENDSEC"], [0, "SECTION"], [2, "ENTITIES"], [0, "INSERT"], [8, "0"], [2, "DOOR"], [10, 1], [20, 1], [0, "ENDSEC"], [0, "EOF"]); const p = P(f); return p.entities.length === 0 && p.skipped.INSERT >= 1; })());
ok("junk never throws and gives nothing: empty, null, numbers, plain text, a truncated file, binary, a file over the size limit", ["", null, 5, {}, "hello world", "0\nSECTION\n2\nENTITIES\n0\nLINE\n8", "\u0000\u0001\u0002".repeat(50), "x".repeat(MAX_DXF_CHARS + 1)].every((t) => { try { const r = T(P(t as any)); return r.objects.length === 0; } catch { return false; } }));
ok("a line with a missing or broken coordinate is skipped (and counted), the good ones still come in", (() => { const f = wrap(dx([0, "LINE"], [8, "0"], [10, 0], [20, 0], [11, "abc"], [21, 1]) + line(0, 0, 4, 0)); const p = P(f); return p.entities.length === 1 && p.skipped.LINE === 1; })());
ok("2,000 random files of random lines in random units: it never throws, never makes more than 400, every wall is at least 5 cm and on the plan, and no wall is repeated", (() => { let seed = 5, bad = 0; const r = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; for (let i = 0; i < 2000; i++) { const n = Math.floor(r() * 30), sc = [1, 10, 1000][Math.floor(r() * 3)]; const f = wrap(Array.from({ length: n }, () => line(r() * 10 * sc, r() * 10 * sc, r() * 10 * sc, r() * 10 * sc)).join("")); let res; try { res = T(P(f), { unit: (["auto", "mm", "cm", "m"] as const)[Math.floor(r() * 4)] }); } catch { bad++; continue; } const ws = walls(res.objects); if (ws.length > MAX_OBJECTS) bad++; const keys = new Set<string>(); for (const w of ws) { if (Math.hypot(w.x2 - w.x1, w.y2 - w.y1) < 0.0499 || w.x1 < 0 || w.y1 < 0 || w.x2 < 0 || w.y2 < 0) bad++; const k = [`${w.x1},${w.y1}`, `${w.x2},${w.y2}`].sort().join("|"); if (keys.has(k)) bad++; keys.add(k); } } return bad === 0; })());
console.log(`\nImporting a DXF drawing: ${pass} passed, ${fail} failed${skipped ? ` (${skipped} skipped: no ezdxf)` : ""}`); process.exit(fail ? 1 : 0);
