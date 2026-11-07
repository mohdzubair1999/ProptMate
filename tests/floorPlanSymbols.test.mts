import { SYMBOLS, SYMBOL_KINDS, SYMBOL_GROUPS, isSymbolKind, symbolDef, cleanObjects, objectToSvg, objectCorners, drawObject, type SymbolObject, type Prim } from "../lib/floorPlanObjects";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const NEW = ["smoke-alarm", "heat-alarm", "co-alarm", "stopcock", "consumer-unit", "meter-electric", "meter-gas", "meter-water", "socket", "fire-extinguisher"];
ok("the catalogue has 45 symbols: the 35 furniture and fittings plus 10 safety and services", SYMBOL_KINDS.length === 45, SYMBOL_KINDS.length);
ok("there are six groups, the new one last: 'Safety and services'", SYMBOL_GROUPS.join("|") === "Bedroom|Living|Kitchen|Bathroom|Other|Safety and services", SYMBOL_GROUPS);
ok("every group has at least one symbol, and every symbol is in a listed group", SYMBOL_GROUPS.every((g) => SYMBOL_KINDS.some((k) => SYMBOLS[k].group === g)) && SYMBOL_KINDS.every((k) => SYMBOL_GROUPS.includes(SYMBOLS[k].group)));
ok("the ten new symbols are exactly the 'Safety and services' group", SYMBOL_KINDS.filter((k) => SYMBOLS[k].group === "Safety and services").sort().join() === [...NEW].sort().join(), SYMBOL_KINDS.filter((k) => SYMBOLS[k].group === "Safety and services"));
ok("the labels read plainly: Smoke alarm, Carbon monoxide alarm, Stopcock, Fuse box / consumer unit, Electricity meter, Gas meter, Water meter, Double socket, Fire extinguisher, Heat alarm", ["Smoke alarm", "Carbon monoxide alarm", "Stopcock", "Fuse box / consumer unit", "Electricity meter", "Gas meter", "Water meter", "Double socket", "Fire extinguisher", "Heat alarm"].every((l) => NEW.some((k) => (SYMBOLS as any)[k].label === l)));
ok("every id is safe (letters, digits, hyphen) and every label is unique", SYMBOL_KINDS.every((k) => /^[A-Za-z0-9-]+$/.test(k)) && new Set(SYMBOL_KINDS.map((k) => SYMBOLS[k].label)).size === SYMBOL_KINDS.length);
ok("every default size is a sensible real-world size (between 5 cm and 4 m)", SYMBOL_KINDS.every((k) => { const d = symbolDef(k); return d.w >= 0.05 && d.l >= 0.05 && d.w <= 4 && d.l <= 4; }));
ok("alarms, meters and the stopcock are small (30 cm), the consumer unit 40 x 30 cm, a socket 30 x 20 cm", NEW.filter((k) => /alarm|meter|stopcock|extinguisher/.test(k)).every((k) => (SYMBOLS as any)[k].w === 0.3 && (SYMBOLS as any)[k].l === 0.3) && SYMBOLS["consumer-unit"].w === 0.4 && SYMBOLS["consumer-unit"].l === 0.3 && SYMBOLS.socket.w === 0.3 && SYMBOLS.socket.l === 0.2);
ok("isSymbolKind accepts new ids and refuses anything else (including names from the object prototype)", NEW.every(isSymbolKind) && !isSymbolKind("toilet") && !isSymbolKind("constructor") && !isSymbolKind("__proto__") && !isSymbolKind(5) && !isSymbolKind(null));
const nums = (s: string) => (s.match(/-?\d+(\.\d+)?(e-?\d+)?/gi) || []).map(Number);
const TYPES = new Set(["line", "rect", "circle", "ellipse", "path", "polygon", "polyline"]);
const sizes: [number, number][] = [[2, 2], [4, 4], [12, 12], [24, 24], [60, 8], [8, 60], [400, 400], [200, 30]];
let bad: string[] = [];
for (const k of SYMBOL_KINDS) for (const [w, l] of sizes) {
  const prims: Prim[] = (SYMBOLS as any)[k].draw(w, l);
  if (!Array.isArray(prims) || prims.length === 0) { bad.push(`${k} ${w}x${l}: nothing drawn`); continue; }
  for (const p of prims) {
    if (!TYPES.has(p.t)) bad.push(`${k}: unknown shape ${p.t}`);
    for (const [name, v] of Object.entries(p.a)) { if (typeof v === "number" && !Number.isFinite(v)) bad.push(`${k} ${w}x${l}: ${name} is not a number`); if (typeof v === "string" && /NaN|Infinity|undefined/.test(v)) bad.push(`${k} ${w}x${l}: ${name} holds NaN`); }
    const a = p.a as any; const all: number[] = [];
    if (p.t === "rect") all.push(a.x, a.y, a.x + a.width, a.y + a.height); else if (p.t === "circle") all.push(a.cx - a.r, a.cy - a.r, a.cx + a.r, a.cy + a.r); else if (p.t === "ellipse") all.push(a.cx - a.rx, a.cy - a.ry, a.cx + a.rx, a.cy + a.ry); else if (p.t === "line") all.push(a.x1, a.y1, a.x2, a.y2); else if (p.t === "path") all.push(...nums(String(a.d))); else all.push(...nums(String(a.points)));
    const xs = all.filter((_, i) => i % 2 === 0), ys = all.filter((_, i) => i % 2 === 1); const slack = Math.max(2, Math.min(w, l) * 0.25);
    if (xs.some((x) => x < -slack || x > w + slack) || ys.some((y) => y < -slack || y > l + slack)) bad.push(`${k} ${w}x${l}: a ${p.t} goes outside its box`);
  }
}
ok(`all 45 symbols at 8 sizes (tiny, normal, huge, long and thin, tall and thin): every shape is a known kind, every number is real, and nothing spills outside the symbol's own box (${SYMBOL_KINDS.length * sizes.length} drawings)`, bad.length === 0, bad.slice(0, 5));
const ser = (k: string) => JSON.stringify((SYMBOLS as any)[k].draw(40, 40));
ok("the ten new icons are all different drawings (none is a copy of another), and none matches an existing symbol", new Set(NEW.map(ser)).size === 10 && !SYMBOL_KINDS.filter((k) => !NEW.includes(k)).some((k) => NEW.some((n) => ser(n) === ser(k))));
ok("the three meters share a frame but differ inside (bolt, flame, drop), and the three alarms differ (S, H, CO)", new Set(["meter-electric", "meter-gas", "meter-water"].map(ser)).size === 3 && new Set(["smoke-alarm", "heat-alarm", "co-alarm"].map(ser)).size === 3);
ok("an alarm is round (a circle drawn first, filled white so it hides the wall behind it)", NEW.filter((k) => /alarm/.test(k)).every((k) => { const p = (SYMBOLS as any)[k].draw(40, 40); return p[0].t === "circle" && p[0].a.fill === "#FFFFFF"; }));
const mk = (symbol: string, o: Partial<SymbolObject> = {}) => ({ id: "s1", kind: "symbol", symbol, x: 3, y: 2, w: 0.3, l: 0.3, rot: 0, ...o });
ok("a plan holding the new symbols keeps them exactly when it is read back from storage", (() => { const raw = NEW.map((k, i) => mk(k, { id: `s${i}`, x: i + 1, y: 1 })); const out: any[] = cleanObjects(raw); return out.length === 10 && out.every((o, i) => o.symbol === NEW[i] && o.kind === "symbol"); })());
ok("a made-up symbol, a symbol named after the object prototype, and markup in a symbol name are all dropped", cleanObjects([mk("toilet"), mk("constructor"), mk("__proto__"), mk("<script>alert(1)</script>"), mk("smoke-alarm")]).length === 1);
ok("on the printed sheet each new symbol becomes real SVG (a group with a position, with its shapes inside), no NaN, balanced tags", NEW.every((k) => { const s = objectToSvg(mk(k) as any); return s.startsWith("<g transform=") && s.endsWith("</g>") && !/NaN|undefined/.test(s) && (s.match(/</g) || []).length === (s.match(/>/g) || []).length; }));
ok("a turned symbol still has four sensible corners, in metres: a 30 cm alarm turned 45 degrees is a diamond 0.42 m across, centred where it was placed, and unturned it is 0.30 m square", (() => { const c = objectCorners(mk("smoke-alarm", { rot: 45 }) as any, 40); const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]); const flat = objectCorners(mk("smoke-alarm") as any, 40).map((p) => p[0]); return c.length === 4 && Math.abs(Math.max(...xs) - Math.min(...xs) - 0.3 * Math.SQRT2) < 0.01 && Math.abs((Math.max(...xs) + Math.min(...xs)) / 2 - 3) < 0.01 && Math.abs((Math.max(...ys) + Math.min(...ys)) / 2 - 2) < 0.01 && Math.abs(Math.max(...flat) - Math.min(...flat) - 0.3) < 0.01; })());
ok("drawObject for a new symbol gives its shapes and a transform and no text", NEW.every((k) => { const d = drawObject(mk(k) as any); return d.prims.length > 0 && d.transform.length > 0 && !d.text; }));
let seed = 21, badf = 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (let t = 0; t < 3000; t++) { const k = NEW[Math.floor(rnd() * NEW.length)]; const o = mk(k, { x: rnd() * 60, y: rnd() * 60, w: 0.05 + rnd() * 3, l: 0.05 + rnd() * 3, rot: rnd() * 720 - 360 }); const s = objectToSvg(o as any); const c = objectCorners(o as any, 40); if (/NaN|Infinity|undefined/.test(s) || c.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1])) || (s.match(/</g) || []).length !== (s.match(/>/g) || []).length) badf++; }
ok("3,000 random new symbols (any size from 5 cm to 3 m, any angle): the printed drawing and the corners are always real numbers and well formed", badf === 0, badf);
console.log(`\nThe floor plan symbol catalogue: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
