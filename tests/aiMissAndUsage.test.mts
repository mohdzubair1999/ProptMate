import { readFileSync } from "node:fs";
import { cleanMissNote, pickMissKind, pickMissMode, MISS_KINDS, MISS_NOTE_MAX, MISS_HOURLY_LIMIT } from "../lib/aiFeedback";
import { usageLevel } from "../lib/planLimits";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 300))); };
const rd = (p: string) => readFileSync(p, "utf8");
// ---- the note ----
ok("a normal note is kept, trimmed", cleanMissNote("  Scuff on the left of the door frame  ") === "Scuff on the left of the door frame");
ok("too short, empty, whitespace and non-text are refused", [null, undefined, 5, {}, "", "   ", "abcd"].every((v) => cleanMissNote(v) === null));
ok("control characters are removed, new lines kept, blank runs squeezed", cleanMissNote("Mark\u0000 on wall\n\n\n\nsecond line") === "Mark on wall\n\nsecond line");
ok("a very long note is cut to the limit", cleanMissNote("x".repeat(5000))!.length === MISS_NOTE_MAX);
ok("kinds: known ones pass, anything else becomes 'other'", MISS_KINDS.every((k) => pickMissKind(k) === k) && pickMissKind("hack") === "other" && pickMissKind(undefined) === "other" && pickMissKind("__proto__") === "other");
ok("mode is quick or detailed only", pickMissMode("detailed") === "detailed" && pickMissMode("deep") === "quick" && pickMissMode(1) === "quick");
// ---- the action ----
const act = rd("lib/actions/aiFeedback.ts"), btn = rd("components/AnalyzePhotoButton.tsx"), page = rd("app/dashboard/settings/ai-feedback/page.tsx"), sch = rd("prisma/schema.prisma");
ok("the action needs a signed-in user with a company, cleans the note, and rate-limits per person per hour", /!user\?\.id \|\| !user\.companyId/.test(act) && /cleanMissNote\(input\?\.note\)/.test(act) && /MISS_HOURLY_LIMIT/.test(act) && MISS_HOURLY_LIMIT === 20);
ok("it attaches an inspection only if it belongs to the signed-in company", /property: \{ companyId: user\.companyId \}/.test(act));
ok("kind and mode are checked before saving, never stored raw", /kind: pickMissKind\(input\.kind\), mode: pickMissMode\(input\.mode\), note/.test(act));
ok("the button shows under every analysis result", /<AiMissButton inspectionId=\{inspectionId\}/.test(btn) && btn.indexOf("<AiMissButton") > btn.indexOf("{result && ("));
ok("only Admin or Manager can read the list, and only their own company's", /user\.role !== "ADMIN" && user\.role !== "MANAGER"/.test(page) && /where: \{ companyId: user\.companyId \}/.test(page));
ok("the table belongs to a company and goes with it when the company is deleted", /model AiMissReport \{[^}]*company\s+Company\s+@relation\(fields: \[companyId\], references: \[id\], onDelete: Cascade\)/.test(sch) && /aiMissReports AiMissReport\[\]/.test(sch));
ok("settings has a link to the page", /settings\/ai-feedback/.test(rd("app/dashboard/settings/page.tsx")));
// ---- usage level ----
ok("below 80% is ok; 80% and over is near; the limit is full", usageLevel(23, 30) === "ok" && usageLevel(24, 30) === "near" && usageLevel(29, 30) === "near" && usageLevel(30, 30) === "full" && usageLevel(45, 30) === "full");
ok("no limit, or nonsense, never warns", usageLevel(500, null) === "ok" && usageLevel(5, 0) === "ok" && usageLevel(NaN, 30) === "ok" && usageLevel(-3, 30) === "ok");
ok("100 and 300 plans warn at 80 and 240", usageLevel(80, 100) === "near" && usageLevel(79, 100) === "ok" && usageLevel(240, 300) === "near" && usageLevel(239, 300) === "ok");
const ban = rd("components/PlanUsageBanner.tsx");
ok("the banner links to Billing, says archive or upgrade, and is silent when ok or no limit", /settings\/billing/.test(ban) && /Archive properties/.test(ban) && /level === "ok" \|\| limit === null\) return null/.test(ban));
ok("it appears on the dashboard and on the (active) properties list", /<PlanUsageBanner companyId=\{companyId\}/.test(rd("app/dashboard/page.tsx")) && /!showArchived && <PlanUsageBanner/.test(rd("app/dashboard/properties/page.tsx")));
// ---- portal wording ----
ok("the tenant note no longer promises a notice we do not send", !/you will be told/.test(rd("app/portal/inspections/[id]/page.tsx")) && /data-testid="portal-updating"/.test(rd("app/portal/inspections/[id]/page.tsx")));
console.log(`\nAI misses, usage banner, portal wording: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
