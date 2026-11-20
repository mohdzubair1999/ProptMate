import { formatDate as FD } from "../lib/formatDate";
import { meterSectionHint as MH, findMeterFields as FM } from "../lib/meterFields";
import { isApplianceItem as AP } from "../lib/standardInventoryItems";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
// ---------- dates in UK time ----------
ok("a completion at 00:30 on a summer morning (23:30 UTC the night before, which is what the server runs in) shows the day it HAPPENED, 12 June", FD(new Date("2026-06-11T23:30:00Z")) === "12/06/2026", FD(new Date("2026-06-11T23:30:00Z")));
ok("the same in winter (UK time = UTC) is unchanged: 23:30 on the 11th is the 11th", FD(new Date("2026-01-11T23:30:00Z")) === "11/01/2026");
ok("midday dates are unchanged in both seasons", FD(new Date("2026-06-15T12:00:00Z")) === "15/06/2026" && FD(new Date("2026-01-15T12:00:00Z")) === "15/01/2026");
ok("the clocks changing: 00:30 on the day they go forward (29 March 2026) and 23:59 on the day they go back (25 October 2026)", FD(new Date("2026-03-29T00:30:00Z")) === "29/03/2026" && FD(new Date("2026-10-24T23:59:00Z")) === "25/10/2026", [FD(new Date("2026-03-29T00:30:00Z")), FD(new Date("2026-10-24T23:59:00Z"))]);
ok("text dates and the UK format (day first) still work, and a bad date never throws", FD("2026-06-15T12:00:00Z") === "15/06/2026" && (() => { try { FD("not a date" as any); return true; } catch { return false; } })());
// ---------- the meter hint ----------
const f = (id: string, label: string, type: string) => ({ id, label, type });
ok("a meter section with a photo but NO box the reader can fill: it says why, and what to add", /isn't available here because this section has no box it can fill/.test(MH("Utility meters", [f("n", "Notes", "TEXT"), f("p", "Photos", "PHOTO")], "p") ?? "") && /"Electric meter reading"/.test(MH("Utility meters", [f("p", "Photos", "PHOTO")], "p") ?? ""));
ok("...and not when the reader CAN be offered (a recognised box)", MH("Utility meters", [f("e", "Electric meter reading", "NUMBER"), f("p", "Photos", "PHOTO")], "p") === null && !!FM("Utility meters", [f("e", "Electric meter reading", "NUMBER"), f("p", "Photos", "PHOTO")], "p"));
for (const title of ["Kitchen", "Keys", "Smoke alarm readings", "Health & safety review", ""]) ok(`a section titled '${title}' never gets the hint`, MH(title, [f("p", "Photos", "PHOTO")], "p") === null);
ok("a field that is not a photo field, an unknown field, and junk give no hint and no crash", [MH("Meters", [f("a", "x", "TEXT")], "a"), MH("Meters", [f("a", "x", "TEXT")], "zzz"), MH("Meters", null as any, "p"), MH(null as any, [], "p"), MH("Meters", [null as any], "p")].every((v) => v === null));
ok("two unnamed reading boxes (ambiguous) also get the hint: the reader is not offered, so the person is told why", MH("Meter readings", [f("a", "Reading 1", "TEXT"), f("b", "Reading 2", "TEXT"), f("p", "Photo", "PHOTO")], "p") !== null);
// ---------- appliances ----------
for (const n of ["Oven / cooker", "Hob", "Fridge / freezer", "Washing machine", "Tumble dryer", "Boiler"]) ok(`the standard '${n}' still counts`, AP(n) && AP(n.toUpperCase()) && AP(`  ${n}  `));
for (const n of ["Dishwasher", "Integrated microwave", "Fridge", "Freezer", "Washer dryer", "Washer-dryer", "Double oven", "Gas hob", "Combi boiler", "Extractor fan", "Cooker hood", "Under-counter fridge freezer", "Microwave oven"]) ok(`'${n}' counts as an appliance (it has a make and model)`, AP(n), n);
for (const n of ["Boiler cupboard door", "Oven shelf", "Hob knob", "Fridge door seal", "Microwave shelf", "Dishwasher panel", "Cooker socket", "Washing machine space", "Oven tray", "Freezer drawer", "Extractor fan switch", "Sofa", "Kettle", "Wall", "", "Dining table", "Cookery book"]) ok(`'${n}' does NOT (a part or fixture, or not an appliance)`, !AP(n), n);
ok("junk never throws", [null, undefined, 5, {}, []].every((v) => { try { AP(v as any); return true; } catch { return false; } }));
console.log(`\nSmall fixes (UK dates, meter hint, appliances): ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
