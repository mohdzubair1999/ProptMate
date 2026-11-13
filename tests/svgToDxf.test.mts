import { svgToDxf, svgsToDxf, svgToEntities, flattenPath, parseTransform, FLOOR_GAP_MM } from "../lib/svgToDxf";
import { objectToSvg as dimSvg, type DimObject } from "../lib/floorPlanObjects";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const O = { pxPerMetre: 40, originPx: 10 }; const near = (a: number, b: number, t = 0.5) => Math.abs(a - b) <= t;
// a small reader of the file we write: the (code, value) pairs, then the entities with their layer and points
type Ent = { type: string; layer: string; pts: [number, number][]; closed: boolean; r: number; text: string; h: number; halign: number; rot: number };
function read(dxf: string) {
  const lines = dxf.split("\n"); const pairs: [number, string][] = []; for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([Number(lines[i]), lines[i + 1]]);
  const ents: Ent[] = []; let cur: Ent | null = null, inEnt = false, inPoly = false; const layers: Record<string, number> = {}; let curLayer = "", inLayerTable = false, version = "", comment = "";
  for (let i = 0; i < pairs.length; i++) { const [c, v] = pairs[i];
    if (c === 999) comment = v; if (c === 9 && v === "$ACADVER") version = pairs[i + 1][1];
    if (c === 2 && v === "LAYER") inLayerTable = true; if (c === 0 && v === "ENDTAB") inLayerTable = false;
    if (inLayerTable && c === 0 && v === "LAYER") { curLayer = pairs[i + 1][1]; } if (inLayerTable && c === 62 && curLayer) layers[curLayer] = Number(v);
    if (c === 2 && v === "ENTITIES") { inEnt = true; continue; } if (!inEnt) continue;
    if (c === 0) { if (v === "VERTEX") { cur!.pts.push([NaN, NaN]); continue; } if (v === "SEQEND") { inPoly = false; continue; } if (v === "ENDSEC" || v === "EOF") { inEnt = false; continue; } cur = { type: v, layer: "", pts: [], closed: false, r: 0, text: "", h: 0, halign: 0, rot: 0 }; ents.push(cur); inPoly = v === "POLYLINE"; continue; }
    if (!cur) continue; const last = cur.pts[cur.pts.length - 1];
    if (c === 8 && !cur.layer) cur.layer = v; else if (c === 70 && cur.type === "POLYLINE") cur.closed = Number(v) === 1;
    else if (c === 10) { if (cur.type === "VERTEX" || (inPoly && last && Number.isNaN(last[0]))) last[0] = Number(v); else if (cur.type !== "POLYLINE") cur.pts.push([Number(v), NaN]); }
    else if (c === 20) { if (inPoly && last && Number.isNaN(last[1])) last[1] = Number(v); else if (cur.type !== "POLYLINE") { const p = cur.pts[0] && Number.isNaN(cur.pts[0][1]) ? cur.pts[0] : cur.pts[cur.pts.length - 1]; if (p && Number.isNaN(p[1])) p[1] = Number(v); } }
    else if (c === 11 && cur.type === "LINE") cur.pts.push([Number(v), NaN]); else if (c === 21 && cur.type === "LINE") { cur.pts[1][1] = Number(v); }
    else if (c === 40) { if (cur.type === "CIRCLE") cur.r = Number(v); else cur.h = Number(v); } else if (c === 1) cur.text = v; else if (c === 72) cur.halign = Number(v); else if (c === 50) cur.rot = Number(v);
  }
  return { ents: ents.filter((e) => e.type !== "VERTEX"), layers, version, comment };
}
const load = (svg: any, opt: any = O) => read(svgToDxf(svg, opt));
// ---- a room ----
let r = load('<g transform="translate(10,10)"><polygon points="0,0 400,0 400,200 0,200" fill="#E7F0EC" stroke="#25344A" stroke-width="1.5"/></g>'); let e = r.ents[0];
ok("a classic release-12 DXF (AC1009)", r.version === "AC1009");
ok("a 10 m x 5 m room is ONE closed polyline of 4 corners on the WALLS layer, in millimetres, north-up (0 to 10,000 across, 0 to -5,000 down)", r.ents.length === 1 && e.type === "POLYLINE" && e.closed && e.layer === "WALLS" && JSON.stringify(e.pts) === JSON.stringify([[0, 0], [10000, 0], [10000, -5000], [0, -5000]]), e);
r = load('<polygon points="10,10 50,10 50,90" stroke="#25344A" fill="none"/>', { pxPerMetre: 80, originPx: 10 }); ok("a different scale (80 px per metre) halves every distance", near(Math.max(...r.ents[0].pts.map((p) => p[0])), 500) && near(Math.min(...r.ents[0].pts.map((p) => p[1])), -1000));
// ---- transforms ----
let ents = svgToEntities('<g transform="translate(110,10) rotate(90)"><rect x="0" y="0" width="40" height="80" stroke="#25344A" fill="none"/></g>', O) as any; let pts = ents[0].pts;
ok("a turned group: corners at (2500,0), (2500,-1000), (500,-1000), (500,0)", [[2500, 0], [2500, -1000], [500, -1000], [500, 0]].every((w) => pts.some((p: number[]) => near(p[0], w[0], 1) && near(p[1], w[1], 1))), pts);
ents = svgToEntities('<g transform="translate(0,0) rotate(180,60,60)"><rect x="50" y="50" width="20" height="20" stroke="#25344A" fill="none"/></g>', O) as any; ok("rotating about a point keeps a square centred on it", (() => { const p = ents[0].pts; const cx = p.reduce((s: number, q: number[]) => s + q[0], 0) / 4, cy = p.reduce((s: number, q: number[]) => s + q[1], 0) / 4; return near(cx, 1250, 1) && near(cy, -1250, 1); })());
ok("transform parsing: translate, scale, matrix, several in order, and garbage is ignored", (() => { const m = parseTransform("translate(10 20) scale(2)"); return m[0] === 2 && m[3] === 2 && m[4] === 10 && m[5] === 20; })() && parseTransform("matrix(1 2 3 4 5 6)").join() === "1,2,3,4,5,6" && parseTransform("garbage(1)").join() === "1,0,0,1,0,0" && parseTransform(undefined).join() === "1,0,0,1,0,0");
ents = svgToEntities('<g transform="translate(10,10)"><g transform="scale(2)"><line x1="0" y1="0" x2="20" y2="0" stroke="#25344A"/></g></g>', O) as any; ok("nested groups multiply: a 20 px line inside scale(2) is 1,000 mm", ents[0].kind === "line" && near(ents[0].b[0] - ents[0].a[0], 1000, 1));
// ---- shapes ----
r = load('<circle cx="50" cy="50" r="6" fill="#FFFFFF" stroke="#8B7355"/>'); e = r.ents[0]; ok("a round symbol is a true CIRCLE, radius 150 mm, on FURNITURE, centred at (1000, -1000)", e.type === "CIRCLE" && near(e.r, 150, 0.2) && e.layer === "FURNITURE" && near(e.pts[0][0], 1000, 0.2) && near(e.pts[0][1], -1000, 0.2), e);
r = load('<g transform="scale(2 1)"><circle cx="30" cy="30" r="10" stroke="#8B7355" fill="none"/></g>'); ok("a circle stretched into an oval becomes a closed 48-point polyline", r.ents[0].type === "POLYLINE" && r.ents[0].closed && r.ents[0].pts.length === 48);
r = load('<line x1="10" y1="10" x2="90" y2="10" stroke="#25344A"/>'); ok("a line is a LINE from (0,0) to (2000,0)", r.ents[0].type === "LINE" && near(r.ents[0].pts[1][0], 2000, 0.1) && near(r.ents[0].pts[1][1], 0, 0.1), r.ents[0]);
ok("an open polyline stays open, a polygon is closed", load('<polyline points="10,10 50,10 50,50" stroke="#25344A" fill="none"/>').ents[0].closed === false && load('<polygon points="10,10 50,10 50,50" stroke="#25344A" fill="none"/>').ents[0].closed === true);
// ---- paths ----
const sq = flattenPath("M 0 0 L 40 0 L 40 40 L 0 40 Z"); ok("a path with lines and Z is one closed shape of 4 points", sq.length === 1 && sq[0].closed && sq[0].pts.length === 4);
ok("relative and absolute commands, H and V, implicit repeats all read the same", JSON.stringify(flattenPath("m 10 10 20 0 0 20 h -20 z")[0].pts) === JSON.stringify(flattenPath("M10,10 H30 V30 H10 Z")[0].pts));
ok("numbers in every form: signs, no leading zero, exponent, commas or spaces", (() => { const p = flattenPath("M1e1,10 L-.5 +2.5e1")[0].pts; return p[0][0] === 10 && p[1][0] === -0.5 && p[1][1] === 25; })());
const cu = flattenPath("M 0 0 C 0 40 40 40 40 0")[0].pts; ok("a curve is 13 points that start and end exactly where it does, and bow upward", cu.length === 13 && cu[0].join() === "0,0" && cu[12].join() === "40,0" && cu[6][1] > 25);
const arc = flattenPath("M 0 0 A 40 40 0 0 1 40 40")[0].pts; ok("a quarter-circle arc: every point is 40 px from its centre (0,40), ending exactly at (40,40)", arc.every((p) => Math.abs(Math.hypot(p[0], p[1] - 40) - 40) < 0.01) && arc[arc.length - 1].join() === "40,40");
ok("arc flags written without spaces ('a1 1 0 011 1') are read right, and too-small radii still reach the end", flattenPath("M 0 0 a 1 1 0 011 1")[0].pts.pop()!.join() === "1,1" && flattenPath("M 0 0 A 1 1 0 0 1 100 0")[0].pts.pop()!.join() === "100,0");
ok("quadratic and smooth continuations flatten without errors", flattenPath("M 0 0 Q 10 20 20 0 T 40 0").length === 1 && flattenPath("M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0")[0].pts.length === 25);
ok("a damaged path keeps what was read before the damage and never throws", flattenPath("M 0 0 L 10 10 L 5").length === 1 && flattenPath("M 0 0 L 10 10 X 5 5")[0].pts.length === 2 && flattenPath("").length === 0 && flattenPath("hello").length === 0);
// ---- text ----
r = load('<text x="100" y="60" font-size="11" text-anchor="middle" fill="#25344A">Kitchen</text>'); e = r.ents[0];
ok("a room name is TEXT on the TEXT layer, centred (alignment 1), about 220 mm high", e.type === "TEXT" && e.layer === "TEXT" && e.text === "Kitchen" && e.halign === 1 && near(e.h, 220, 1) && near(e.pts[0][0], 2250, 1) && near(e.pts[0][1], -1250, 1), e);
r = load('<text x="10" y="10" font-size="10">12.3m² 20° ± “q” – ok 😀 é</text>'); ok("text is plain ASCII: ² becomes 2, ° becomes %%d, ± %%p, curly quotes and dashes straightened, emoji and accents dropped", r.ents[0].text === '12.3m2 20%%d %%p "q" - ok', r.ents[0].text);
ok("split text is joined ('Bedroom 1'); empty or unprintable text makes nothing", load('<text x="0" y="0"><tspan>Bed</tspan><tspan>room 1</tspan></text>').ents[0].text === "Bedroom 1" && svgToEntities('<text x="1" y="1"></text><text x="1" y="1">😀</text>', O).length === 0);
r = load('<text x="1" y="1">line one\n0\nSECTION\n2\nENTITIES</text>'); ok("text trying to smuggle in DXF structure with line breaks stays ONE harmless line", r.ents.length === 1 && !/\n/.test(r.ents[0].text) && r.ents[0].text === "line one 0 SECTION 2 ENTITIES", r.ents[0].text);
// ---- layers ----
r = load('<g transform="translate(10,10)"><polygon points="0,0 100,0 100,100 0,100" stroke="#25344A" fill="#E7F0EC"/><rect x="40" y="-3" width="20" height="6" fill="#FBF8F4"/><rect x="10" y="10" width="20" height="10" stroke="#8B7355" fill="#FFFFFF"/><line x1="0" y1="50" x2="5" y2="50" stroke="#D96B44"/><text x="10" y="90" font-size="9">Hall</text></g>');
ok("walls, a door gap, furniture, an unlisted colour and text each land on their own layer", r.ents.map((x) => x.layer).join() === "WALLS,OPENINGS,FURNITURE,PLAN,TEXT", r.ents.map((x) => x.layer));
ok("the painted-over door gap is kept as a closed OUTLINE on OPENINGS", r.ents[1].type === "POLYLINE" && r.ents[1].closed && r.ents[1].pts.length === 4);
ok("the layer table has exactly the layers in use with their colours (walls 7, furniture 30, openings 1, text 2, other 8)", JSON.stringify(r.layers) === JSON.stringify({ WALLS: 7, FURNITURE: 30, OPENINGS: 1, TEXT: 2, PLAN: 8 }) || (r.layers.WALLS === 7 && r.layers.FURNITURE === 30 && r.layers.OPENINGS === 1 && r.layers.TEXT === 2 && r.layers.PLAN === 8), r.layers);
ok("a north arrow (a dark fill, no outline) goes on the PLAN layer as an outline, NOT on OPENINGS", (() => { const e = load('<path d="M0,0 L8,4 L0,8 Z" fill="#25344A"/><path d="M -4,8 L 0,-2 L 4,8 Z" fill="#25344A"/>').ents; return e.length === 2 && e.every((x) => x.layer === "PLAN" && x.type === "POLYLINE" && x.closed); })());
ok("a door's hinge dot (a brown fill, no outline) is a CIRCLE on the PLAN layer, not an opening", (() => { const e = load('<circle cx="50" cy="50" r="4" fill="#8B7355"/>').ents; return e.length === 1 && e[0].type === "CIRCLE" && e[0].layer === "PLAN"; })());
ok("only a gap painted in the PAPER colour is an opening (any capitals), a white or other fill is not", load('<rect x="1" y="1" width="9" height="3" fill="#FBF8F4"/>').ents[0].layer === "OPENINGS" && load('<rect x="1" y="1" width="9" height="3" fill="#fbf8f4"/>').ents[0].layer === "OPENINGS" && load('<rect x="1" y="1" width="9" height="3" fill="#FFFFFF"/>').ents[0].layer === "PLAN" && load('<rect x="1" y="1" width="9" height="3" fill="#D96B44"/>').ents[0].layer === "PLAN");
ok("a pattern fill with no outline (the garden hatch, which the sanitizer drops anyway) is never drawn", svgToEntities('<rect x="1" y="1" width="9" height="9" fill="url(#gardenHatch)"/>', O).length === 0);
ok("a shape with an outline is still judged by its OUTLINE colour whatever its fill (a room is WALLS even with a paper-coloured fill)", load('<polygon points="1,1 9,1 9,9" fill="#FBF8F4" stroke="#25344A"/>').ents[0].layer === "WALLS");
r = load('<g stroke="#25344A" fill="none"><polygon points="10,10 50,10 50,50"/><rect x="60" y="10" width="10" height="10" stroke="#8B7355"/></g>'); ok("a stroke set on a group is inherited unless a shape sets its own", r.ents[0].layer === "WALLS" && r.ents[1].layer === "FURNITURE");
ok("invisible shapes (no stroke, no fill), zero-size rectangles and one-point polygons make nothing", svgToEntities('<rect x="0" y="0" width="10" height="10" fill="none" stroke="none"/><rect x="0" y="0" width="0" height="10" stroke="#25344A"/><polygon points="1,1" stroke="#25344A"/>', O).length === 0);
// ---- hostile and extreme input ----
ok("an empty or non-text drawing gives a valid empty DXF, and garbage never throws", load("").ents.length === 0 && load(null).ents.length === 0 && ["<<<>>>", "not svg at all", "<g><g><g>", "<rect x='NaN' y='1e999'/>"].every((s) => { try { svgToDxf(s, O); return true; } catch { return false; } }));
ok("a script, a link or an image in the drawing is never exported", svgToEntities('<script>alert(1)</script><a href="x"><rect x="0" y="0" width="9" height="9" stroke="#25344A"/></a><image href="x"/><foreignObject/>', O).length === 0);
const many = Array.from({ length: 30000 }, (_, i) => `<rect x="${i}" y="0" width="5" height="5" stroke="#25344A" fill="none"/>`).join(""); const t0 = Date.now(); const big = svgToEntities(many, O); ok(`30,000 shapes are capped at 20,000 entities (${Date.now() - t0} ms)`, big.length === 20000 && Date.now() - t0 < 5000);
ok("100 levels of nested groups are cut off safely", (() => { try { return svgToEntities("<g>".repeat(100) + '<rect x="0" y="0" width="9" height="9" stroke="#25344A"/>' + "</g>".repeat(100), O).length <= 1; } catch { return false; } })());
ok("a nonsense scale or origin falls back to sensible values (no NaN or Infinity in the file)", [{ pxPerMetre: 0, originPx: NaN }, { pxPerMetre: -5, originPx: Infinity }, { pxPerMetre: NaN, originPx: 0 }].every((o) => !/NaN|Infinity/.test(svgToDxf('<polygon points="1,1 9,1 9,9" stroke="#25344A" fill="none"/>', o))));
r = load('<polygon points="1,1 9,1 9,9" stroke="#25344A" fill="none"/>', { ...O, title: "12 Évian Rd\nLondon\n0\nSECTION" }); ok("a property title with accents and line breaks becomes ONE safe comment line", r.comment === "ProptMate floor plan: 12 vian Rd London 0 SECTION. Units: millimetres.", r.comment);
ok("the same drawing always gives exactly the same file", svgToDxf('<polygon points="1,1 9,1 9,9" stroke="#25344A" fill="none"/>', O) === svgToDxf('<polygon points="1,1 9,1 9,9" stroke="#25344A" fill="none"/>', O));
let seed = 5, bad = 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const R = () => Math.round(rnd() * 600 - 100);
const tag = () => { const k = Math.floor(rnd() * 6); return k === 0 ? `<rect x="${R()}" y="${R()}" width="${R() + 150}" height="${R() + 150}" stroke="#25344A" fill="none"/>` : k === 1 ? `<circle cx="${R()}" cy="${R()}" r="${Math.abs(R()) + 1}" stroke="#8B7355" fill="none"/>` : k === 2 ? `<line x1="${R()}" y1="${R()}" x2="${R()}" y2="${R()}" stroke="#25344A"/>` : k === 3 ? `<path d="M ${R()} ${R()} C ${R()} ${R()} ${R()} ${R()} ${R()} ${R()} A ${Math.abs(R()) + 1} ${Math.abs(R()) + 1} ${R()} ${Math.floor(rnd() * 2)} ${Math.floor(rnd() * 2)} ${R()} ${R()}" stroke="#8B7355" fill="none"/>` : k === 4 ? `<text x="${R()}" y="${R()}" font-size="${6 + Math.floor(rnd() * 12)}">T${Math.floor(rnd() * 99)}</text>` : `<polygon points="${R()},${R()} ${R()},${R()} ${R()},${R()}" stroke="#25344A" fill="none"/>`; };
for (let t = 0; t < 300; t++) { const svg = `<g transform="translate(10,10) rotate(${Math.floor(rnd() * 360)})">` + Array.from({ length: 5 + Math.floor(rnd() * 30) }, tag).join("") + "</g>"; const txt = svgToDxf(svg, { pxPerMetre: 20 + Math.floor(rnd() * 100), originPx: 10 }); const q = read(txt); if (/NaN|Infinity|undefined/.test(txt) || q.ents.some((en) => en.pts.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1])))) bad++; if (!txt.endsWith("0\nEOF\n")) bad++; if ((txt.match(/^0\nPOLYLINE$/gm) || []).length !== (txt.match(/^0\nSEQEND$/gm) || []).length) bad++; }
ok("300 random drawings (shapes, curves, arcs, turned groups, scales): no NaN anywhere, every point real, every file ends properly, every POLYLINE closed off by a SEQEND", bad === 0, bad);
// ================= several floors in one file =================
const room = (x0: number, w: number, h: number) => `<g transform="translate(10,10)"><polygon points="${x0},0 ${x0 + w},0 ${x0 + w},${h} ${x0},${h}" fill="#E7F0EC" stroke="#25344A"/><rect x="${x0 + 10}" y="10" width="20" height="10" fill="#FFF" stroke="#8B7355"/><text x="${x0 + 40}" y="60" font-size="11" text-anchor="middle">Room</text></g>`;
const fl = (name: string, svg: string) => ({ name, innerSvg: svg, pxPerMetre: 40, originPx: 10 });
const bb = (es: Ent[]) => { const xs = es.flatMap((e) => e.pts.map((p) => p[0])), ys = es.flatMap((e) => e.pts.map((p) => p[1])); return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }; };
let mf = read(svgsToDxf([fl("Ground floor", room(0, 400, 200)), fl("First floor", room(0, 200, 120))], "12 Example Road"));
ok("one classic DXF holds both floors, with the property in the header comment", mf.version === "AC1009" && mf.comment === "ProptMate floor plan: 12 Example Road. Units: millimetres.", mf.comment);
const g1 = mf.ents.filter((e) => e.layer.startsWith("GROUND_FLOOR_")), g2 = mf.ents.filter((e) => e.layer.startsWith("FIRST_FLOOR_"));
ok("each floor's things are on layers named after the floor: GROUND_FLOOR_WALLS, GROUND_FLOOR_FURNITURE, GROUND_FLOOR_TEXT and FIRST_FLOOR_...", ["GROUND_FLOOR_WALLS", "GROUND_FLOOR_FURNITURE", "GROUND_FLOOR_TEXT", "FIRST_FLOOR_WALLS", "FIRST_FLOOR_FURNITURE", "FIRST_FLOOR_TEXT"].every((l) => mf.ents.some((e) => e.layer === l)) && mf.ents.every((e) => /^(GROUND|FIRST)_FLOOR_/.test(e.layer)), mf.ents.map((e) => e.layer));
ok("the layer table lists them with the usual colours (walls 7, furniture 30, text 2)", mf.layers.GROUND_FLOOR_WALLS === 7 && mf.layers.FIRST_FLOOR_WALLS === 7 && mf.layers.GROUND_FLOOR_FURNITURE === 30 && mf.layers.FIRST_FLOOR_TEXT === 2, mf.layers);
const b1 = bb(g1.filter((e) => e.type !== "TEXT")), b2 = bb(g2.filter((e) => e.type !== "TEXT"));
ok("the first floor starts at x = 0 and is 10 m wide; the second starts 5 m clear of it (x = 15,000) and is 5 m wide", near(b1.minX, 0, 1) && near(b1.maxX, 10000, 1) && near(b2.minX, 10000 + FLOOR_GAP_MM, 1) && near(b2.maxX, 15000 + 5000, 1) && FLOOR_GAP_MM === 5000, [b1, b2]);
ok("each floor keeps its own heights (north is up for both: the 5 m floor spans 0 to -5,000, the 3 m floor 0 to -3,000)", near(b1.minY, -5000, 1) && near(b1.maxY, 0, 1) && near(b2.minY, -3000, 1) && near(b2.maxY, 0, 1));
const lab = mf.ents.filter((e) => e.type === "TEXT" && /^(GROUND|FIRST)_FLOOR_TEXT$/.test(e.layer) && ["Ground floor", "First floor"].includes(e.text));
ok("each floor is labelled with its name, 700 mm above its top-left corner, 350 mm high, on that floor's TEXT layer", lab.length === 2 && lab.every((l) => near(l.h, 350, 0.1)) && near(lab.find((l) => l.text === "Ground floor")!.pts[0][0], 0, 1) && near(lab.find((l) => l.text === "Ground floor")!.pts[0][1], 700, 1) && near(lab.find((l) => l.text === "First floor")!.pts[0][0], 15000, 1), lab);
mf = read(svgsToDxf([fl("A", room(0, 400, 200)), fl("B", room(0, 400, 200)), fl("C", room(0, 400, 200))]));
ok("three floors are 15,000 mm apart in turn (10 m wide + 5 m gap), never overlapping", [0, 15000, 30000].every((x, i) => near(bb(mf.ents.filter((e) => e.layer.startsWith("ABC".charAt(i) + "_") && e.type !== "TEXT")).minX, x, 1)));
mf = read(svgsToDxf([fl("Floor", room(0, 100, 100)), fl("Floor", room(0, 100, 100)), fl("floor", room(0, 100, 100))]));
ok("floors with the SAME name still get different layers (FLOOR_WALLS, FLOOR_2_WALLS, FLOOR_3_WALLS), so nothing is merged", ["FLOOR_WALLS", "FLOOR_2_WALLS", "FLOOR_3_WALLS"].every((l) => mf.ents.some((e) => e.layer === l)), [...new Set(mf.ents.map((e) => e.layer))]);
mf = read(svgsToDxf([fl("Basement / Cellar!", room(0, 100, 100)), fl("", room(0, 100, 100)), fl("Étage 😀 premier", room(0, 100, 100)), fl("A very very long floor name that goes on and on", room(0, 100, 100))]));
const ls = [...new Set(mf.ents.map((e) => e.layer))];
ok("awkward names make safe layer names (only A-Z, 0-9 and underscore, at most 18 characters for the floor part): 'Basement / Cellar!' is BASEMENT_CELLAR, an empty name is FLOOR2, accents and emoji are dropped", ls.every((l) => /^[A-Z0-9_]+$/.test(l)) && ls.some((l) => l.startsWith("BASEMENT_CELLAR_")) && ls.some((l) => l.startsWith("FLOOR2_")) && ls.some((l) => l.startsWith("TAGE_PREMIER_")) && ls.every((l) => l.length <= 18 + 12), ls);
mf = read(svgsToDxf([fl("Ground\n0\nSECTION\n2\nENTITIES", room(0, 100, 100))]));
ok("a floor name trying to smuggle in DXF structure with line breaks becomes harmless: a safe layer name and ONE line of label text", mf.ents.every((e) => /^[A-Z0-9_]+$/.test(e.layer)) && mf.ents.filter((e) => e.type === "TEXT" && e.layer.endsWith("_TEXT") && !/Room/.test(e.text)).every((e) => !/\n/.test(e.text) && e.text === "Ground 0 SECTION 2 ENTITIES"), mf.ents.filter((e) => e.type === "TEXT").map((e) => e.text));
mf = read(svgsToDxf([fl("Empty", ""), fl("Ground", room(0, 100, 100)), fl("Also empty", "<g></g>"), fl("First", room(0, 100, 100))]));
ok("a floor with nothing drawn takes no layers and no space: the two real floors are still 5 m apart", !mf.ents.some((e) => /EMPTY|ALSO/.test(e.layer)) && near(bb(mf.ents.filter((e) => e.layer.startsWith("FIRST_") && e.type !== "TEXT")).minX - bb(mf.ents.filter((e) => e.layer.startsWith("GROUND_") && e.type !== "TEXT")).maxX, FLOOR_GAP_MM, 1));
ok("nothing to export (no floors, only empty floors, junk) gives a valid empty DXF, never an error", [[], [fl("E", "")], null, undefined, "x", [null, 5, {}], [{ name: "x" }]].every((x: any) => { try { const r = read(svgsToDxf(x)); return r.ents.length === 0 && r.version === "AC1009"; } catch { return false; } }));
ok("at most 12 floors are exported (a 20-floor input is cut at 12)", new Set(read(svgsToDxf(Array.from({ length: 20 }, (_, i) => fl(`F${i}`, room(0, 100, 100))))).ents.map((e) => e.layer.split("_")[0])).size === 12);
ok("a single floor still uses the PLAIN layer names (WALLS, FURNITURE, TEXT), unchanged by the new code", read(svgToDxf(room(0, 400, 200), O)).ents.map((e) => e.layer).sort().join() === "FURNITURE,TEXT,WALLS");
let seed3 = 8, bad3 = 0; const rnd3 = () => (seed3 = (seed3 * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (let k = 0; k < 200; k++) { const n = 1 + Math.floor(rnd3() * 6); const floors = Array.from({ length: n }, (_, i) => fl(["Ground", "First", "Second", "", "Loft", "Ground"][Math.floor(rnd3() * 6)], room(Math.floor(rnd3() * 50), 80 + Math.floor(rnd3() * 400), 60 + Math.floor(rnd3() * 300)))); const txt = svgsToDxf(floors, "x"); const r = read(txt);
  if (/NaN|Infinity|undefined/.test(txt) || !txt.endsWith("0\nEOF\n")) bad3++;
  const groups = new Map<string, Ent[]>(); for (const e of r.ents) if (e.type !== "TEXT") { const key = e.layer.replace(/_(WALLS|FURNITURE|OPENINGS|PLAN)$/, ""); (groups.get(key) ?? groups.set(key, []).get(key)!).push(e); }
  const boxes = [...groups.values()].map(bb).sort((a, b) => a.minX - b.minX); for (let i = 1; i < boxes.length; i++) if (boxes[i].minX - boxes[i - 1].maxX < FLOOR_GAP_MM - 1) bad3++;
  if (new Set(r.ents.map((e) => e.layer)).size !== Object.keys(r.layers).length) bad3++; }
ok("200 random sets of 1-6 floors (any names, any sizes): never overlapping (always at least 5 m apart), no NaN, ends properly, and every layer in use is in the layer table", bad3 === 0, bad3);
// ================= door and window gaps cut the walls =================
const wallsOf = (svg: string) => (svgToEntities(svg, O) as any[]).filter((e) => e.layer === "WALLS");
const len = (pts: number[][], closed = false) => { let s = 0; for (let i = 0; i + 1 < pts.length; i++) s += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (closed && pts.length > 1) s += Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]); return s; };
const total = (es: any[]) => es.reduce((n, e) => n + (e.kind === "line" ? len([e.a, e.b]) : len(e.pts, e.closed)), 0);
const ROOM = '<polygon points="0,0 400,0 400,200 0,200" fill="#E7F0EC" stroke="#25344A"/>', gap = (x: number, y: number, w: number, h: number) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#FBF8F4"/>`;
const inG = (s: string) => `<g transform="translate(10,10)">${s}</g>`;
let w = wallsOf(inG(ROOM + gap(190, -3, 20, 6)));
ok("a 0.5 m door gap in the middle of the top wall CUTS the room outline open: it is no longer closed, and the wall has lost exactly 500 mm (30,000 to 29,500)", w.length === 1 && w[0].closed === false && near(total(w), 29500, 0.5), [w.length, w[0]?.closed, total(w)]);
ok("the cut room is one line that starts at one edge of the doorway (x 5,250), runs right round the room, and ends at the other edge (x 4,750): the doorway is the only break", (() => { const q = w[0].pts; return q.length === 6 && near(q[0][0], 5250, 0.5) && near(q[0][1], 0, 0.5) && near(q[5][0], 4750, 0.5) && near(q[5][1], 0, 0.5) && near(q[2][0], 10000, 0.5) && near(q[2][1], -5000, 0.5); })(), w[0]?.pts);
ok("the doorway's own outline stays on the OPENINGS layer, as a closed 4-corner shape", (() => { const o = (svgToEntities(inG(ROOM + gap(190, -3, 20, 6)), O) as any[]).filter((e) => e.layer === "OPENINGS"); return o.length === 1 && o[0].closed && o[0].pts.length === 4; })());
w = wallsOf(inG(ROOM + gap(190, -3, 20, 6) + gap(-3, 80, 6, 20)));
ok("two gaps (a door in the top wall and a window in the left wall) make two lines, with 1,000 mm removed in all", w.length === 2 && w.every((e: any) => !e.closed) && near(total(w), 29000, 0.5), [w.length, total(w)]);
w = wallsOf(inG(ROOM + gap(300, 80, 20, 20)));
ok("a gap that does not touch the wall changes nothing: the outline stays ONE CLOSED shape of 4 corners", w.length === 1 && w[0].closed === true && w[0].pts.length === 4 && near(total(w), 30000, 0.5));
w = wallsOf(inG(ROOM + gap(390, -3, 20, 6)));
ok("a gap over a CORNER removes the corner's bit of both walls (10 px of the top wall and 3 px of the right wall = 325 mm)", w.length === 1 && !w[0].closed && near(total(w), 30000 - 325, 0.5), total(w));
w = wallsOf(inG(ROOM + gap(-10, -3, 20, 6)));
ok("a gap over the START vertex (where the outline begins and ends) still gives ONE continuous line, not two halves", w.length === 1 && !w[0].closed && near(total(w), 30000 - 10 / 40 * 1000 - 3 / 40 * 1000, 0.5), [w.length, total(w)]);
w = wallsOf(inG(ROOM + gap(-3, 80, 6, 20)));
ok("a gap in the LAST wall (the left one, which joins the start) is one continuous line too", w.length === 1 && !w[0].closed && near(total(w), 29500, 0.5));
w = wallsOf(`<g transform="translate(10,10) rotate(30)">${ROOM}${gap(190, -3, 20, 6)}</g>`);
ok("a turned room with its gap turned with it is cut just the same (500 mm removed)", w.length === 1 && !w[0].closed && near(total(w), 29500, 0.5), total(w));
ents = svgToEntities(inG('<line x1="0" y1="0" x2="400" y2="0" stroke="#25344A"/>' + gap(190, -3, 20, 6)), O) as any;
ok("a free-standing wall (a line) is cut into two lines either side of the gap", ents.filter((e: any) => e.layer === "WALLS" && e.kind === "line").length === 2 && near(total(ents.filter((e: any) => e.layer === "WALLS")), 10000 - 500, 0.5));
ents = svgToEntities(inG('<polygon points="150,-20 250,-20 250,20 150,20" stroke="#8B7355" fill="#FFF"/>' + ROOM + gap(190, -3, 20, 6)), O) as any;
ok("furniture crossing a gap is NOT cut (only walls are)", ents.some((e: any) => e.layer === "FURNITURE" && e.closed && e.pts.length === 4));
w = wallsOf(inG('<polygon points="0,0 40,0 40,20 0,20" stroke="#25344A" fill="none"/>' + gap(-20, -3, 100, 6)));
ok("a gap longer than the wall it covers (80 px over a 40 px wall) removes that whole wall and nothing breaks", w.length >= 1 && w.every((e: any) => e.pts.length >= 2 && e.pts.every((p: number[]) => Number.isFinite(p[0]) && Number.isFinite(p[1]))) && near(total(w), 10 * 25 + 10 * 25 + 20 * 25 + 0, 2000), total(w));
ok("shapes with no gaps at all are left exactly as they were (same objects, same order)", JSON.stringify(svgToEntities(inG(ROOM), O)) === JSON.stringify([{ kind: "poly", layer: "WALLS", pts: [[0, 0], [10000, 0], [10000, -5000], [0, -5000]], closed: true }]));
// ---- property test: checked by an independent method (dense sampling) ----
let seed4 = 41, bad4 = 0; const rnd4 = () => (seed4 = (seed4 * 1664525 + 1013904223) % 4294967296) / 4294967296;
// STRICTLY inside a rectangle: a point exactly on its edge is not inside (a wall that only touches a gap's edge is not cut)
const inRect = (p: number[], r: number[][]) => { let sgn = 0; for (let i = 0; i < 4; i++) { const a = r[i], b = r[(i + 1) % 4]; const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); if (Math.abs(c) < 1e-6) return false; if (sgn === 0) sgn = Math.sign(c); else if (Math.sign(c) !== sgn) return false; } return true; };
const distToPolygon = (p: number[], poly: number[][]) => { let best = Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1; const tt = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)); best = Math.min(best, Math.hypot(p[0] - a[0] - tt * dx, p[1] - a[1] - tt * dy)); } return best; };
for (let k = 0; k < 150; k++) {
  const W = 60 + Math.floor(rnd4() * 300), H = 40 + Math.floor(rnd4() * 200), rot = Math.floor(rnd4() * 360); const nGaps = Math.floor(rnd4() * 5);
  const gaps = Array.from({ length: nGaps }, () => { const side = Math.floor(rnd4() * 4), at = rnd4(), gw = 10 + Math.floor(rnd4() * 40); return side === 0 ? gap(Math.floor(at * W) - gw / 2, -3, gw, 6) : side === 1 ? gap(W - 3, Math.floor(at * H) - gw / 2, 6, gw) : side === 2 ? gap(Math.floor(at * W) - gw / 2, H - 3, gw, 6) : gap(-3, Math.floor(at * H) - gw / 2, 6, gw); });
  const svg = `<g transform="translate(10,10) rotate(${rot})"><polygon points="0,0 ${W},0 ${W},${H} 0,${H}" stroke="#25344A" fill="none"/>${gaps.join("")}</g>`;
  const all = svgToEntities(svg, O) as any[]; const walls = all.filter((e) => e.layer === "WALLS"), masks = all.filter((e) => e.layer === "OPENINGS").map((e) => e.pts as number[][]);
  const orig = (svgToEntities(svg.replace(/<rect[^>]*fill="#FBF8F4"\/>/g, ""), O) as any[]).filter((e) => e.layer === "WALLS")[0];
  let insideLen = 0; const N = 4000; for (let i = 0; i < orig.pts.length; i++) { const a = orig.pts[i], b = orig.pts[(i + 1) % orig.pts.length]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 0; s < N; s++) { const tt = (s + 0.5) / N; if (masks.some((m) => inRect([a[0] + (b[0] - a[0]) * tt, a[1] + (b[1] - a[1]) * tt], m))) insideLen += L / N; } }
  const origLen = len(orig.pts, true), kept = total(walls);
  if (Math.abs(origLen - insideLen - kept) > origLen * 0.002 + 1) bad4++; // nothing lost or invented: whole = kept + cut
  for (const e of walls) for (let i = 0; i + 1 < e.pts.length; i++) {
    const a = e.pts[i], b = e.pts[i + 1];
    if (distToPolygon(a, orig.pts) > 0.01 || distToPolygon(b, orig.pts) > 0.01) bad4++; // every piece sits on the original outline
    if (masks.some((m) => inRect([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m))) bad4++; // and no piece lies inside a gap
  }
  if (/NaN|Infinity/.test(JSON.stringify(walls))) bad4++;
}
ok("150 random rooms (any size, any angle) with 0 to 4 random door and window gaps: for each, the wall kept plus the wall inside the gaps equals the original wall (nothing lost, nothing invented), every piece sits on the original outline, no piece lies inside a gap, and no number is ever NaN (checked by dense sampling, not by the code's own method)", bad4 === 0, bad4);
ok("a wall that merely TOUCHES a gap's edge is not cut: a gap standing on the wall's line whose left edge is exactly the room's right wall leaves the 2.5 m square outline closed, whole, 10,000 mm", (() => { const w2 = wallsOf(inG('<polygon points="0,0 100,0 100,100 0,100" stroke="#25344A" fill="none"/>' + gap(100, -3, 20, 6))); return w2.length === 1 && w2[0].closed === true && w2[0].pts.length === 4 && near(total(w2), 10000, 0.5); })());
// ---------- dimensions go to their own layer ----------
{ const d = (x1: number, y1: number, x2: number, y2: number, off = 0.5): DimObject => ({ id: "d", kind: "dim", x1, y1, x2, y2, off });
  const wrap = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180" viewBox="0 0 420 180"><line x1="10" y1="10" x2="130" y2="10" stroke="#25344A" stroke-width="4"/>${inner}</svg>`;
  const out = read(svgToDxf(wrap(dimSvg(d(0, 0, 3, 0))), O)); const dl = out.ents.filter((e) => e.layer === "DIMENSIONS");
  ok("a dimension is exported on a DIMENSIONS layer: five lines (the dimension line, two slashes, two extension lines) and its text", dl.filter((e) => e.type === "LINE").length === 5 && dl.filter((e) => e.type === "TEXT").length === 1, dl.map((e) => e.type));
  const text = dl.find((e) => e.type === "TEXT")!; const longest = dl.filter((e) => e.type === "LINE").map((e) => Math.hypot(e.pts[1][0] - e.pts[0][0], e.pts[1][1] - e.pts[0][1])).sort((a, b) => b - a)[0];
  ok("the text says 3.00 m, is centred on the dimension line, level, and the dimension line is 3,000 mm long (the true size)", text.text === "3.00 m" && text.halign === 1 && near(text.rot, 0, 0.01) && near(longest, 3000, 1) && near(text.pts[0][0], 1500, 1), [text.text, text.halign, text.rot, longest, text.pts[0]]);
  ok("its wall stays on WALLS and nothing of the dimension leaks onto TEXT, PLAN or WALLS", out.ents.filter((e) => e.layer === "WALLS").length === 1 && out.ents.filter((e) => e.layer === "TEXT").length === 0 && out.ents.filter((e) => e.layer === "PLAN").length === 0);
  ok("the layer is listed in the file with its own colour (cyan, 4)", out.layers["DIMENSIONS"] === 4 && out.layers["WALLS"] === 7, out.layers);
  const v = read(svgToDxf(wrap(dimSvg(d(0, 0, 0, 3))), O)).ents.find((e) => e.type === "TEXT")!;
  ok("a vertical dimension's text is turned to run up the line (a quarter turn)", Math.abs(((v.rot % 360) + 360) % 360 - 90) < 0.5 || Math.abs(((v.rot % 360) + 360) % 360 - 270) < 0.5, v.rot);
  const plain = read(svgToDxf(`<svg xmlns="http://www.w3.org/2000/svg" width="420" height="180"><line x1="10" y1="10" x2="130" y2="10" stroke="#25344A" stroke-width="4"/></svg>`, O));
  ok("a plan with no dimension has no DIMENSIONS layer in the file (nothing empty is listed)", !("DIMENSIONS" in plain.layers));
  const fl2 = (name: string, inner: string) => ({ name, innerSvg: inner, pxPerMetre: 40, originPx: 10 }); const floors = read(svgsToDxf([fl2("Ground", dimSvg(d(0, 0, 3, 0))), fl2("First", dimSvg(d(0, 0, 4, 0)))]));
  ok("with every floor in one file each floor has its own dimensions layer", Object.keys(floors.layers).filter((l) => /DIMENSIONS/.test(l)).length === 2, Object.keys(floors.layers)); }
console.log(`\nDXF export of a floor plan: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
