import { dimStatusLine as DS, segmentIntersection as X, buildAnchors as B, findObjectSnap as S, resolveWallPoint as R, parseTypedLength as P, typedWallEnd as T, describeWall as D, statusLine, SNAP_LABEL, MAX_TYPED_LENGTH_M } from "../lib/cadSnap";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 500))); };
const pt = (x: number, y: number) => ({ x, y });
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) < e;
// ---------- crossings ----------
ok("two lines that cross give the crossing point", (() => { const r = X(pt(0, 0), pt(4, 4), pt(0, 4), pt(4, 0)); return !!r && near(r.x, 2) && near(r.y, 2); })());
ok("a T-junction (one wall ending on another) is found", (() => { const r = X(pt(0, 2), pt(4, 2), pt(2, 2), pt(2, 5)); return !!r && near(r.x, 2) && near(r.y, 2); })());
ok("parallel and non-meeting lines give nothing", X(pt(0, 0), pt(4, 0), pt(0, 1), pt(4, 1)) === null && X(pt(0, 0), pt(1, 0), pt(2, -1), pt(2, 1)) === null && X(pt(0, 0), pt(4, 0), pt(1, 0), pt(3, 0)) === null);
// ---------- anchors ----------
const a1 = B({ walls: [{ a: pt(0, 0), b: pt(4, 0) }, { a: pt(2, -1), b: pt(2, 3) }] });
const kinds = (an: any[], x: number, y: number) => an.find((q) => near(q.p.x, x, 1e-3) && near(q.p.y, y, 1e-3))?.kind;
ok("a wall gives its two ends and its middle", kinds(a1, 0, 0) === "endpoint" && kinds(a1, 4, 0) === "endpoint" && kinds(a1, 2, 0) !== undefined && kinds(a1, 2, 3) === "endpoint");
ok("where two walls cross there is an intersection; the middle of the first wall is where the second crosses it, and that point is an intersection (it outranks a midpoint)", kinds(a1, 2, 0) === "intersection", a1);
ok("the middle of a wall that nothing crosses is a midpoint", kinds(B({ walls: [{ a: pt(0, 0), b: pt(6, 0) }] }), 3, 0) === "midpoint");
const sq = [pt(1, 1), pt(5, 1), pt(5, 4), pt(1, 4)];
const a2 = B({ polygons: [sq] });
ok("a room gives each real corner and the middle of each edge", ["1|1", "5|1", "5|4", "1|4"].every((k) => { const [x, y] = k.split("|").map(Number); return kinds(a2, x, y) === "endpoint"; }) && kinds(a2, 3, 1) === "midpoint" && kinds(a2, 5, 2.5) === "midpoint" && kinds(a2, 3, 4) === "midpoint" && kinds(a2, 1, 2.5) === "midpoint" && a2.length === 8, a2.length);
const L = [pt(0, 0), pt(4, 0), pt(4, 2), pt(2, 2), pt(2, 4), pt(0, 4)];
ok("an L-shaped room has its REAL corners and none where its corner is missing (no phantom corner at 4,4)", kinds(B({ polygons: [L] }), 2, 2) === "endpoint" && kinds(B({ polygons: [L] }), 4, 4) === undefined && B({ polygons: [L] }).filter((q) => q.kind === "endpoint").length === 6);
ok("a wall crossing a room's edge gives an intersection on that edge", kinds(B({ walls: [{ a: pt(3, 0), b: pt(3, 6) }], polygons: [sq] }), 3, 1) === "intersection" && kinds(B({ walls: [{ a: pt(3, 0), b: pt(3, 6) }], polygons: [sq] }), 3, 4) === "intersection");
ok("the same point is listed once, at its best kind (a wall ending exactly on a room's corner is one endpoint)", (() => { const an = B({ walls: [{ a: pt(1, 1), b: pt(1, 6) }], polygons: [sq] }); return an.filter((q) => near(q.p.x, 1) && near(q.p.y, 1)).length === 1 && kinds(an, 1, 1) === "endpoint"; })());
ok("junk never throws, and bad points and tiny lines are handled", [null, undefined, {}, { walls: "x" }, { walls: [null, { a: 1, b: 2 }, { a: pt(NaN, 0), b: pt(1, 1) }] }, { polygons: [[pt(0, 0)], "x", null] }].every((x) => { try { return Array.isArray(B(x as any)); } catch { return false; } }) && B({ walls: [{ a: pt(0, 0), b: pt(0.01, 0) }] }).length === 1);
ok("a plan with 600 walls is still processed (the pair limit keeps it quick)", (() => { const t0 = Date.now(); const w = Array.from({ length: 600 }, (_, i) => ({ a: pt(i % 30, Math.floor(i / 30)), b: pt((i % 30) + 0.7, Math.floor(i / 30) + 0.4) })); const an = B({ walls: w }); return an.length > 1000 && Date.now() - t0 < 3000; })());
// ---------- snapping to them ----------
const anchors = B({ walls: [{ a: pt(0, 0), b: pt(4, 0) }] });
ok("near an endpoint it snaps to that endpoint; near the middle, to the midpoint; further than the radius, to nothing", S(pt(0.05, 0.04), anchors, 0.2)?.kind === "endpoint" && S(pt(2.03, 0.05), anchors, 0.2)?.kind === "midpoint" && S(pt(1, 1), anchors, 0.2) === null);
ok("the radius is respected exactly (just inside snaps, just outside does not), and a zero or bad radius never snaps", S(pt(0.19, 0), anchors, 0.2) !== null && S(pt(0.21, 0), anchors, 0.2) === null && S(pt(0, 0), anchors, 0) === null && S(pt(0, 0), anchors, NaN) === null && S(pt(0, 0), null as any, 0.2) === null);
ok("when an endpoint and a midpoint are both close, the endpoint wins when the midpoint is only slightly nearer, but a clearly nearer midpoint wins", (() => { const an = [{ p: pt(0, 0), kind: "endpoint" as const }, { p: pt(0.1, 0), kind: "midpoint" as const }]; return S(pt(0.06, 0), an, 0.3)?.kind === "endpoint" && S(pt(0.12, 0), an, 0.3)?.kind === "midpoint"; })());
// ---------- where a wall point goes ----------
const base = { anchors, radius: 0.2, snapOn: true, grid: 0.05, mode: "ortho" as const };
{ const r = R({ ...base, raw: pt(0.08, 0.06), start: pt(3, 3) });
  ok("an endpoint nearby wins over everything, even over ortho (object snap beats angle lock), and says so", near(r.p.x, 0) && near(r.p.y, 0) && r.kind === "endpoint" && r.label === "Endpoint", r); }
{ const r = R({ ...base, raw: pt(3, 1.04), start: pt(1, 1) }); ok("ortho keeps a wall horizontal or vertical from its start, rounding the length to 5 cm", near(r.p.y, 1) && near(r.p.x, 3) && r.kind === "ortho", r); }
{ const r = R({ ...base, raw: pt(2.0, 6.2), start: pt(1.5, 1.2) }); ok("ortho goes vertical when the pointer is mostly up or down", near(r.p.x, 1.5) && near(r.p.y, 6.2) && r.kind === "ortho", r); }
{ const r = R({ ...base, mode: "polar", raw: pt(4.1, 3.9), start: pt(1, 1) }); ok("polar locks to 45 degree steps (an exact diagonal)", near(r.p.x - 1, r.p.y - 1, 0.06) && r.kind === "polar", r); }
{ const r = R({ ...base, mode: "free", raw: pt(3.33, 2.71), start: pt(1, 1) }); ok("free puts the point on the 5 cm grid at any angle", near(r.p.x, 3.35, 1e-6) && near(r.p.y, 2.7, 1e-6) && r.kind === "grid", r); }
{ const r = R({ ...base, raw: pt(3.33, 2.71), start: pt(1, 1), shift: true }); ok("holding Shift flips ortho to free for that point", near(r.p.x, 3.35) && near(r.p.y, 2.7), r); const f = R({ ...base, mode: "free", raw: pt(3.33, 1.02), start: pt(1, 1), shift: true }); ok("...and flips free to ortho", near(f.p.y, 1), f); }
{ const r = R({ ...base, raw: pt(7.04, 5.97), start: null }); ok("the first point of a wall goes onto the grid", near(r.p.x, 7.05) && near(r.p.y, 5.95) && r.kind === "grid", r); }
{ const r = R({ ...base, snapOn: false, raw: pt(0.05, 0.04), start: pt(2, 2) }); ok("with object snap OFF an endpoint right there is ignored and the point is locked by ortho", r.kind === "ortho" && !(near(r.p.x, 0) && near(r.p.y, 0)), r); }
{ const r = R({ ...base, raw: pt(-3, -2), start: pt(1, 1), mode: "free" }); ok("nothing is ever placed off the top or left of the plan", r.p.x >= 0 && r.p.y >= 0, r); const r2 = R({ ...base, raw: pt(-3, -2), start: null }); ok("...including the first point", r2.p.x >= 0 && r2.p.y >= 0, r2); }
ok("labels read as in a CAD program", SNAP_LABEL.endpoint === "Endpoint" && SNAP_LABEL.midpoint === "Midpoint" && SNAP_LABEL.intersection === "Intersection" && SNAP_LABEL.ortho === "Ortho" && SNAP_LABEL.polar === "Polar 45°");
// ---------- typing an exact length ----------
ok("lengths typed in metres: 3.2, .5, 3, 3.  are accepted and rounded to the millimetre", P("3.2") === 3.2 && P(".5") === 0.5 && P("3") === 3 && P("3.") === 3 && P("0.0004") === null && P("12.3456") === 12.346);
ok("nothing, a lone point, zero, more than 60 m, letters, signs, spaces, two points are all refused", ["", ".", "0", "0.000", "60.001", "100", "abc", "-3", "3 2", "3..2", "1.2.3", "3m", "1e3", " 3"].every((s) => P(s) === null) && P("60") === 60 && MAX_TYPED_LENGTH_M === 60 && P(null) === null && P(5 as any) === null);
{ const e = T(pt(1, 1), pt(5, 1), 3.2); ok("an exact length is placed along the way the pointer points (east)", !!e && near(e.x, 4.2) && near(e.y, 1), e); }
{ const e = T(pt(1, 1), pt(1, 4), 2.5); ok("...north-south too", !!e && near(e.x, 1) && near(e.y, 3.5), e); }
{ const e = T(pt(2, 2), pt(3, 3), Math.SQRT2 * 2); ok("...and diagonally, to the millimetre", !!e && near(e.x, 4, 0.002) && near(e.y, 4, 0.002), e); }
ok("a length that would run off the top or left of the plan is refused, not clipped", T(pt(1, 1), pt(0, 1), 3) === null && T(pt(1, 1), pt(1, 0), 3) === null && T(pt(1, 1), pt(0, 1), 1) !== null);
ok("the typed length is exact: 100 random lengths and directions come out within a millimetre of what was typed", (() => { let seed = 3; const r = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; let bad = 0; for (let i = 0; i < 100; i++) { const s = pt(20 + r() * 5, 20 + r() * 5), t = pt(s.x + (r() - 0.5) * 10, s.y + (r() - 0.5) * 10), len = P((0.1 + r() * 15).toFixed(3))!; const e = T(s, t, len); if (!e || Math.abs(Math.hypot(e.x - s.x, e.y - s.y) - len) > 0.0015) bad++; } return bad === 0; })());
ok("junk never throws", [null, undefined, "x", {}].every((v) => { try { return T(v as any, v as any, 1) === null; } catch { return false; } }));
// ---------- the readout ----------
ok("the readout gives the length and the angle as CAD does (0 = east, 90 = north)", (() => { const e = D(pt(0, 0), pt(3, 0)), n = D(pt(0, 5), pt(0, 2)), w = D(pt(5, 0), pt(2, 0)), s = D(pt(0, 0), pt(0, 3)); return e.length === 3 && e.angleDeg === 0 && n.angleDeg === 90 && w.angleDeg === 180 && s.angleDeg === 270; })());
const st = statusLine({ cursor: pt(3.456, 2.1), start: pt(1, 2.1), snap: { p: pt(3.5, 2.1), kind: "endpoint", label: "Endpoint" }, mode: "ortho", snapOn: true, zoom: 1.25, typed: "" });
ok("the status line shows the cursor, the length and angle, the snap, the mode, F3 and F8, and the zoom", st === "X 3.46  Y 2.10 m  ·  Length 2.46 m  Angle 0.0°  ·  Snap: Endpoint  ·  Ortho (F8)  ·  Object snap on (F3)  ·  125%", st);
ok("a typed length replaces the live length, and says Enter places it", /Length 3\.2 m {2}⏎ to place/.test(statusLine({ cursor: pt(1, 1), start: pt(0, 0), snap: null, mode: "free", snapOn: false, zoom: 1, typed: "3.2" })) && !/Angle/.test(statusLine({ cursor: pt(1, 1), start: pt(0, 0), snap: null, mode: "free", snapOn: false, zoom: 1, typed: "3.2" })));
ok("grid, ortho and polar are not announced as 'Snap:' (only real object snaps are); a message comes first; off is shown", !/Snap:/.test(statusLine({ cursor: null, start: null, snap: { p: pt(0, 0), kind: "ortho", label: "Ortho" }, mode: "polar", snapOn: false, zoom: 2, typed: "" })) && statusLine({ cursor: null, start: null, snap: null, mode: "polar", snapOn: false, zoom: 2, typed: "", message: "Too long" }).startsWith("Too long  ·  Polar 45° (F8)  ·  Object snap off (F3)  ·  200%"));
ok("a bad zoom never shows NaN", !/NaN/.test(statusLine({ cursor: null, start: null, snap: null, mode: "free", snapOn: true, zoom: NaN, typed: "" })));
// ---------- the dimension tool's status line ----------
{ const base = { cursor: pt(3.456, 2.1), a: null, b: null, off: null, snap: null, snapOn: true, zoom: 1 };
  ok("first click: it says what to do, shows the pointer, the snap switch and the zoom", DS({ ...base, stage: 0 }) === "Click the first point  ·  X 3.46  Y 2.10 m  ·  Object snap on (F3)  ·  100%", DS({ ...base, stage: 0 }));
  ok("second click: it shows the length so far, and the snap when there is one", DS({ ...base, stage: 1, a: pt(1, 2.1), snap: { p: pt(3.5, 2.1), kind: "endpoint", label: "Endpoint" } }) === "Click the second point  ·  Length 2.46 m  ·  X 3.46  Y 2.10 m  ·  Snap: Endpoint  ·  Object snap on (F3)  ·  100%");
  ok("third click: it says to set the offset and shows the length and the offset (and no snap, as that click is not snapped)", DS({ ...base, stage: 2, a: pt(0, 0), b: pt(3, 0), off: 0.75, snap: { p: pt(0, 0), kind: "endpoint", label: "Endpoint" } }) === "Move to set how far out the line sits, then click  ·  Length 3.00 m  ·  Offset 0.75 m  ·  X 3.46  Y 2.10 m  ·  Object snap on (F3)  ·  100%");
  ok("junk (no cursor, a bad zoom, a bad offset) never shows NaN or undefined", !/NaN|undefined|null/.test(DS({ ...base, cursor: null, stage: 2, a: pt(0, 0), b: pt(3, 0), off: NaN, snapOn: false, zoom: NaN })) && /Object snap off/.test(DS({ ...base, snapOn: false, stage: 0 }))); }
// ---------- random: the result is always a valid, snapped, on-plan point ----------
{ let seed = 11, bad = 0; const r = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let i = 0; i < 1500; i++) { const walls = Array.from({ length: Math.floor(r() * 6) }, () => ({ a: pt(r() * 12, r() * 9), b: pt(r() * 12, r() * 9) })); const an = B({ walls, polygons: r() < 0.5 ? [sq] : [] }); const raw = pt(r() * 14 - 1, r() * 11 - 1); const start = r() < 0.7 ? pt(r() * 12, r() * 9) : null; const mode = (["ortho", "polar", "free"] as const)[Math.floor(r() * 3)]; const snapOn = r() < 0.7; const res = R({ raw, start, mode, anchors: an, radius: 0.2, snapOn, grid: 0.05, shift: r() < 0.2 });
    if (!Number.isFinite(res.p.x) || !Number.isFinite(res.p.y) || res.p.x < 0 || res.p.y < 0) bad++;
    if (res.kind === "endpoint" || res.kind === "midpoint" || res.kind === "intersection") { if (!snapOn || !an.some((a) => near(a.p.x, res.p.x, 1e-5) && near(a.p.y, res.p.y, 1e-5) && a.kind === res.kind)) bad++; if (Math.hypot(raw.x - res.p.x, raw.y - res.p.y) > 0.2 + 1e-6 && !(raw.x < 0 || raw.y < 0)) bad++; }
    else if (!snapOn || !an.length) { /* no object snap possible */ } }
  ok("1,500 random points on random plans: always a real number on the plan; an object snap is only ever to a point that exists, of that kind, within the radius, and never when snapping is off", bad === 0, bad); }
console.log(`\nPrecise drawing (snaps, ortho, exact lengths): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
