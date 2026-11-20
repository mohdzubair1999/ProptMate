import { cleanObjects, isPin, nextPinNumber, objectCorners, drawObject, objectToSvg, duplicateObjects, moveObject, alignObjects, MAX_PIN, PIN_COLOUR, MAX_OBJECTS, type PlanObject } from "../lib/floorPlanObjects";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const pin = (n: number, text = "Damp patch", extra: any = {}): any => ({ id: `p${n}`, kind: "label", x: 2, y: 3, text, size: 12, rot: 0, pin: n, ...extra });
const label = (extra: any = {}): any => ({ id: "l1", kind: "label", x: 2, y: 3, text: "Hall", size: 12, rot: 0, ...extra });
// ---------- stored and read back ----------
const [a] = cleanObjects([pin(3, "Cracked tile by the door")]) as any[];
ok("a pin is kept exactly: its number, note and position", a.kind === "label" && a.pin === 3 && a.text === "Cracked tile by the door" && a.x === 2 && a.y === 3 && isPin(a));
ok("an ordinary label stays an ordinary label (no pin number added)", !("pin" in (cleanObjects([label()])[0] as any)) && !isPin(cleanObjects([label()])[0]));
for (const bad of [0, 100, -1, 1.5, "3", NaN, Infinity, null, undefined, true, {}, [3]]) ok(`a pin number of ${JSON.stringify(bad)} is not a pin: the note stays as an ordinary label`, (() => { const o = cleanObjects([pin(1, "Note", { pin: bad })]) as any[]; return o.length === 1 && !("pin" in o[0]); })());
ok("1 and 99 are valid pin numbers (the limits are inclusive)", (cleanObjects([pin(1), pin(99)]) as any[]).map((o) => o.pin).join() === "1,99" && MAX_PIN === 99);
ok("a pin is never turned, whatever it was saved with (its number must read upright)", (cleanObjects([pin(2, "x", { rot: 90 })]) as any[])[0].rot === 0 && (cleanObjects([label({ rot: 90 })]) as any[])[0].rot === 90);
ok("a pin with no note is dropped like any empty label; its note is cleaned like any label text", cleanObjects([pin(1, "   ")]).length === 0 && (cleanObjects([pin(1, "A\u0000B\u202eC  D")]) as any[])[0].text === "A BC D");
ok("a long note is cut at 80 characters", (cleanObjects([pin(1, "x".repeat(200))]) as any[])[0].text.length === 80);
ok("reading a cleaned list again changes nothing", JSON.stringify(cleanObjects(cleanObjects([pin(1), pin(2), label(), pin(7, "z")]))) === JSON.stringify(cleanObjects([pin(1), pin(2), label(), pin(7, "z")])));
// ---------- next free number ----------
ok("the next pin number is the smallest free one, 1 to 99: none used gives 1, 1 and 2 used gives 3, a gap is filled (1, 2, 4 used gives 3)", nextPinNumber([]) === 1 && nextPinNumber([pin(1), pin(2)]) === 3 && nextPinNumber([pin(1), pin(2), pin(4)]) === 3 && nextPinNumber([pin(2)]) === 1);
ok("ordinary labels and furniture do not use up pin numbers", nextPinNumber([label(), label({ id: "l2" }), { id: "s", kind: "symbol", symbol: "bed-double", x: 1, y: 1, w: 1, l: 1, rot: 0 } as any]) === 1);
ok("with all 99 numbers in use there is no next number (null)", nextPinNumber(Array.from({ length: 99 }, (_, i) => pin(i + 1))) === null && nextPinNumber(Array.from({ length: 98 }, (_, i) => pin(i + 1))) === 99);
ok("two pins that somehow share a number do not confuse it", nextPinNumber([pin(1), pin(1, "again", { id: "dup" })]) === 2);
// ---------- size and drawing ----------
const wide = (objectCorners(pin(1, "x".repeat(80), { size: 40 }), 40) as number[][]).map((p) => p[0]);
ok("a pin is a fixed 0.45 m square (18 px at 40 px a metre) however long its note or big its size, centred on its point", Math.abs(Math.max(...wide) - Math.min(...wide) - 0.45) < 1e-9 && Math.abs((Math.max(...wide) + Math.min(...wide)) / 2 - 2) < 1e-9);
ok("an ordinary label's box still depends on its text (it is not given the pin's fixed size)", (() => { const c = objectCorners(label({ text: "x".repeat(40) }), 40) as number[][]; const xs = c.map((p) => p[0]); return Math.max(...xs) - Math.min(...xs) > 0.45 * 3; })());
const d = drawObject(pin(12, "Damp"), 40, 10);
ok("a pin is drawn as an orange disc with a white edge (centred on its point) and its NUMBER in white bold, upright", d.transform === "" && d.prims.length === 1 && d.prims[0].t === "circle" && d.prims[0].a.fill === PIN_COLOUR && d.prims[0].a.stroke === "#FFFFFF" && d.prims[0].a.r === 9 && d.prims[0].a.cx === 90 && d.prims[0].a.cy === 130 && d.text!.value === "12" && d.text!.fill === "#FFFFFF" && d.text!.bold === true && d.text!.x === 90);
ok("the pin's NOTE is not drawn on the plan (it is listed in the key), only its number", !JSON.stringify(drawObject(pin(1, "Rising damp behind the sofa"))).includes("Rising damp"));
ok("the pin's size does not change with the plan's scale (it is 9 px in radius at any pixels-per-metre)", drawObject(pin(1), 80, 10).prims[0].a.r === 9 && drawObject(pin(1), 20, 10).prims[0].a.r === 9);
const svg = objectToSvg(pin(5, "x"));
ok("on the printed sheet the pin is real SVG: a circle and a white bold number, balanced tags, no NaN", /<circle [^>]*fill="#C2410C"/.test(svg) && />5<\/text>/.test(svg) && /fill="#FFFFFF" font-weight="700"/.test(svg) && (svg.match(/</g) || []).length === (svg.match(/>/g) || []).length && !/NaN|undefined/.test(svg), svg);
ok("an ordinary label prints exactly as before (dark text, no bold)", objectToSvg(label()) === '<text x="90" y="134.2" font-size="12" fill="#25344A" text-anchor="middle">Hall</text>' || (/fill="#25344A" text-anchor="middle">Hall<\/text>/.test(objectToSvg(label())) && !/font-weight/.test(objectToSvg(label()))), objectToSvg(label()));
// ---------- duplicating, moving ----------
const dup = duplicateObjects([pin(1), pin(2), pin(3)] as PlanObject[], ["p1"]);
ok("duplicating pin 1 when 1, 2 and 3 exist makes a copy numbered 4 (never a second number 1), moved a little", dup.objects.length === 4 && (dup.objects[3] as any).pin === 4 && (dup.objects[3] as any).x === 2.3 && (dup.objects[3] as any).text === "Damp patch" && dup.newIds.length === 1);
const dup2 = duplicateObjects([pin(1), pin(2)] as PlanObject[], ["p1", "p2"]);
ok("duplicating two pins at once numbers the copies 3 and 4", dup2.objects.map((o: any) => o.pin).join() === "1,2,3,4");
ok("with all 99 numbers used a pin cannot be duplicated (no copy, nothing breaks)", (() => { const all = Array.from({ length: 99 }, (_, i) => pin(i + 1)) as PlanObject[]; const r = duplicateObjects(all, ["p1"]); return r.objects.length === 99 && r.newIds.length === 0; })());
ok("duplicating an ordinary label or furniture is unchanged", (() => { const r = duplicateObjects([label()] as PlanObject[], ["l1"]); return r.objects.length === 2 && !("pin" in (r.objects[1] as any)); })());
ok("moving a pin keeps its number and note", (() => { const m = moveObject(pin(7, "Mould") as PlanObject, 1, -1) as any; return m.pin === 7 && m.text === "Mould" && m.x === 3 && m.y === 2; })());
ok("aligning pins works (it uses their fixed box)", (() => { const objs = [pin(1, "a", { x: 1, y: 1 }), pin(2, "b", { id: "p2", x: 5, y: 3 })] as PlanObject[]; const o = alignObjects(objs, ["p1", "p2"], "left") as any[]; return o[0].x === o[1].x && o[0].pin === 1 && o[1].pin === 2; })());
// ---------- limits and random ----------
ok("pins count towards the 400 object limit like any object", cleanObjects(Array.from({ length: 450 }, (_, i) => pin((i % 99) + 1, "n", { id: `q${i}` }))).length === MAX_OBJECTS);
let seed = 13, bad = 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const junk = () => [0, 1, 50, 99, 100, -3, 2.5, "7", null, NaN, undefined, true][Math.floor(rnd() * 12)];
for (let t = 0; t < 3000; t++) { const raw = Array.from({ length: Math.floor(rnd() * 8) }, (_, i) => pin(1, rnd() < 0.8 ? "Note " + i : "", { id: rnd() < 0.5 ? `a${i}` : "same", pin: junk(), x: rnd() < 0.9 ? rnd() * 20 : junk(), rot: rnd() * 400 })); const c = cleanObjects(raw) as any[];
  for (const o of c) { if ("pin" in o && !(Number.isInteger(o.pin) && o.pin >= 1 && o.pin <= 99 && o.rot === 0)) bad++; if (/NaN|Infinity/.test(objectToSvg(o))) bad++; const cs = objectCorners(o); if (cs.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) bad++; }
  if (new Set(c.map((o) => o.id)).size !== c.length) bad++; if (JSON.stringify(cleanObjects(c)) !== JSON.stringify(c)) bad++; }
ok("3,000 random lists of pins and junk: every pin number kept is a whole number 1 to 99 with no turn, ids stay unique, drawings and corners are always real numbers, and cleaning again changes nothing", bad === 0, bad);
console.log(`\nDefect pins on a floor plan: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
