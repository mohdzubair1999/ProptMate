import { proofreadInventory as P, mergeEvidence as M, type ProofItem } from "../lib/proofread";
import { checkEvidence } from "../lib/evidenceCheck";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const it = (room: string, itemName: string, condition = "good", o: Partial<ProofItem> = {}): ProofItem => ({ room, itemName, condition, cleanliness: "clean", notes: "Fine", ...o });
const kinds = (r: ReturnType<typeof P>) => r.map((f) => f.kind).join();
// ---------- damage and wear ----------
let r = P([it("Kitchen", "Oven", "damaged", { notes: null })]); ok("damaged with NO note: an important finding naming the item and room", r.length === 1 && r[0].level === "important" && r[0].kind === "damage-without-note" && /Oven \(Kitchen\) is marked damaged but has no note saying what the damage is/.test(r[0].message), r);
r = P([it("Kitchen", "Oven", "beyond_economical_repair", { notes: "" })]); ok("beyond economical repair with no note: the same, worded with its own label", r.length === 1 && /beyond economical repair/.test(r[0].message) && r[0].level === "important");
for (const n of ["-", ".", "n/a", "  ", "ok", "\n", "--"]) { r = P([it("K", "Oven", "damaged", { notes: n })]); ok(`a 'note' of ${JSON.stringify(n)} does not count as a description`, r.length === 1 && r[0].kind === "damage-without-note", r); }
r = P([it("K", "Oven", "damaged", { notes: "Door glass cracked" })]); ok("damaged WITH a real note: nothing", r.length === 0);
r = P([it("K", "Oven", "damaged", { notes: "£120" })]); ok("a note of three letters or digits is enough (the check is for a missing description, not a good one)", r.length === 0);
r = P([it("K", "Oven", "damaged", { notes: "Rôle 🔥 ñ" })]); ok("accented and non-English letters count as letters", r.length === 0);
r = P([it("L", "Sofa", "worn", { notes: null })]); ok("worn with no note: a tip", r.length === 1 && r[0].level === "tip" && r[0].kind === "wear-without-note", r);
r = P([it("L", "Sofa", "wear_and_tear", { notes: null }), it("L", "Lamp", "good", { notes: null }), it("L", "Rug", "new", { notes: null })]); ok("wear and tear, good and new with no note: nothing (nothing to evidence)", r.length === 0);
r = P([it("K", "Hob", "good", { cleanliness: "not_cleaned", notes: null })]); ok("not cleaned with no note: a tip about the cleaning claim", r.length === 1 && r[0].kind === "cleanliness-without-note" && /not cleaned but has no note saying what needs cleaning/.test(r[0].message), r);
r = P([it("K", "Hob", "good", { cleanliness: "requires_cleaning", notes: null })]); ok("requires cleaning with no note: the same", r.length === 1 && /requires cleaning/.test(r[0].message));
r = P([it("K", "Hob", "good", { cleanliness: "not_cleaned", notes: "Grease on the hob and splashback" })]); ok("a cleaning issue WITH a note: nothing", r.length === 0);
for (const c of ["clean", "professionally_cleaned", "n/a", "", null, "custom text"]) { r = P([it("K", "Hob", "good", { cleanliness: c as any, notes: null })]); ok(`cleanliness ${JSON.stringify(c)} needs no note`, r.length === 0); }
r = P([it("K", "Oven", "damaged", { cleanliness: "not_cleaned", notes: null })]); ok("damaged AND not cleaned with no note: both are reported (two separate findings)", kinds(r).split(",").sort().join() === "cleanliness-without-note,damage-without-note", kinds(r));
// ---------- repeated defect notes ----------
r = P([it("L", "Sofa", "worn", { notes: "Scuff marks to the front" }), it("L", "Table", "worn", { notes: "scuff  marks to the FRONT." })]); ok("the same defect note on two different items (ignoring capitals, spacing and punctuation): a tip listing both", r.length === 1 && r[0].kind === "repeated-defect-note" && /Sofa \(L\), Table \(L\)/.test(r[0].message) && /Check it applies to each/.test(r[0].message), r);
r = P([it("L", "Sofa", "good", { notes: "Clean and in good order throughout" }), it("L", "Table", "good", { notes: "Clean and in good order throughout" }), it("L", "Rug", "good", { notes: "Clean and in good order throughout" })]); ok("the same NON-defect note on many items (a standard phrase) is NOT flagged: that would be noise", r.length === 0, r);
r = P([it("L", "Sofa", "worn", { notes: "Scuff marks to the front" }), it("K", "Sofa", "worn", { notes: "Scuff marks to the front" })]); ok("the same note on the same item NAME in different rooms still counts as different items", r.length === 1);
r = P([it("L", "Sofa", "worn", { notes: "Scuff marks to the front" }), it("L", "Sofa", "worn", { notes: "Scuff marks to the front" })]); ok("two entries for the same item in the same room are not 'different items'", r.length === 0, r);
r = P(["Sofa", "Table", "Rug", "Chair", "Desk"].map((n) => it("L", n, "worn", { notes: "Scuff marks to the front" }))); ok("five items: the first three are named and the rest counted ('and 2 more'), and it is ONE finding", r.length === 1 && /and 2 more/.test(r[0].message), r);
r = P([it("L", "Sofa", "worn", { notes: "Scuff" }), it("L", "Table", "worn", { notes: "Scuff" })]); ok("very short defect notes are not compared (too generic to say they were copied)", r.length === 0);
r = P([it("L", "Sofa", "worn", { notes: "x".repeat(200) + " crack" }), it("L", "Table", "worn", { notes: "x".repeat(200) + " crack" })]); ok("a very long repeated note is quoted shortened in the message", r.length === 1 && r[0].message.includes("…") && r[0].message.length < 300, r[0]?.message.length);
// ---------- merging ----------
const base = checkEvidence([{ room: "Kitchen", itemName: "Oven", condition: "damaged", notes: null, photoCount: 0 }]);
const extra = P([it("Kitchen", "Oven", "damaged", { notes: null }), it("Bath", "Tap", "worn", { notes: null })]);
const m = M(base, extra); ok("merged: the existing photo finding and the new note findings together, important ones first, counts recomputed", m.findings.length === base.findings.length + extra.length && m.counts.important === m.findings.filter((f) => f.level === "important").length && m.counts.tip === m.findings.filter((f) => f.level === "tip").length && m.findings.slice(0, m.counts.important).every((f) => f.level === "important"), m);
ok("merging nothing changes nothing", JSON.stringify(M(base, [])) === JSON.stringify(base) && M(base, null as any).findings.length === base.findings.length);
ok("a missing base is treated as empty", M(null as any, extra).findings.length === extra.length && M(undefined as any, []).findings.length === 0);
// ---------- junk and fuzz ----------
let thr = 0; for (const junk of [null, undefined, 5, "x", {}, [null], [5], [{}], [{ room: 1, itemName: 2, condition: 3, notes: 4 }]] as any[]) { try { P(junk); } catch { thr++; } } ok("junk input never throws", thr === 0, thr);
let seed = 12, bad = 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
for (let t = 0; t < 3000; t++) { const items = Array.from({ length: Math.floor(rnd() * 14) }, () => it(pick(["K", "L", "", "Bed"]), pick(["Oven", "Sofa", "Bed", ""]), pick(["new", "good", "worn", "damaged", "beyond_economical_repair", "wear_and_tear", "x", ""]), { cleanliness: pick(["clean", "not_cleaned", "requires_cleaning", null, ""]), notes: pick([null, "", "-", "Scuff marks to the front", "Door glass cracked", "Clean and tidy throughout", "crack in the glass door"]) }));
  const out = P(items);
  for (const f of out) { if (!f.message || !f.room || !["important", "tip"].includes(f.level)) bad++; if (f.kind === "damage-without-note" && f.level !== "important") bad++; }
  const expectDamage = items.filter((i) => ["damaged", "beyond_economical_repair"].includes(String(i.condition).toLowerCase()) && ((String(i.notes ?? "").match(/[\p{L}\p{N}]/gu) || []).length < 3)).length; if (out.filter((f) => f.kind === "damage-without-note").length !== expectDamage) bad++;
  if (items.every((i) => ["new", "good", "wear_and_tear", "x", ""].includes(String(i.condition)) && !["not_cleaned", "requires_cleaning"].includes(String(i.cleanliness)))) { if (out.some((f) => f.kind !== "repeated-defect-note")) bad++; } }
ok("3,000 random inventories: every finding is well formed, the damage-without-note count is exact, and an inventory with nothing damaged, worn or uncleaned only ever gets the copied-note tip", bad === 0, bad);
console.log(`\nBefore you finish: note and wording checks: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
