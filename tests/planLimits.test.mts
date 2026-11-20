import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { propertyLimitFor, teamLimitFor, checkPropertyLimit, checkTeamLimit } from "../lib/planLimits";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const rd = (p: string) => readFileSync(p, "utf8");
// ---------- the numbers ----------
ok("property limits are 30 / 100 / 300 / 400", propertyLimitFor("starter") === 30 && propertyLimitFor("growth") === 100 && propertyLimitFor("scale") === 300 && propertyLimitFor("enterprise") === 400);
ok("team limits are 1 / 5 / unlimited / unlimited", teamLimitFor("starter") === 1 && teamLimitFor("growth") === 5 && teamLimitFor("scale") === null && teamLimitFor("enterprise") === null);
ok("no plan recorded, or one we do not know, is never restricted", [null, undefined, "", "pro", "constructor", "__proto__", "toString"].every((t) => propertyLimitFor(t as any) === null && teamLimitFor(t as any) === null && checkPropertyLimit(t as any, 99999, 5).ok && checkTeamLimit(t as any, 99999).ok));
// ---------- properties ----------
ok("29 of 30 can add one, 30 of 30 cannot", checkPropertyLimit("starter", 29, 1).ok === true && checkPropertyLimit("starter", 30, 1).ok === false);
ok("exactly filling the plan is allowed, one over is not", checkPropertyLimit("starter", 20, 10).ok === true && checkPropertyLimit("starter", 20, 11).ok === false);
ok("remaining is reported", (checkPropertyLimit("starter", 20, 5) as any).remaining === 5 && (checkPropertyLimit("scale", 0, 1) as any).remaining === 299);
const full = checkPropertyLimit("growth", 100, 1) as any;
ok("the message names the plan and the way out (archive, upgrade in Billing)", /Growth plan allows 100 properties/.test(full.message) && /Archive a property/.test(full.message) && /Settings, Billing/.test(full.message), full.message);
const bulk = checkPropertyLimit("starter", 28, 5) as any;
ok("a bulk add that does not fit says how many fit", /you have 28/.test(bulk.message) && /5 more/.test(bulk.message) && /room for 2/.test(bulk.message), bulk.message);
ok("a company already over its plan can add nothing but is not otherwise broken", checkPropertyLimit("starter", 45, 1).ok === false && (checkPropertyLimit("starter", 45, 1) as any).remaining === 0);
ok("silly counts (negative, NaN, fractions) never throw or wrongly block", checkPropertyLimit("starter", -5, 1).ok && checkPropertyLimit("starter", NaN as any, 1).ok && checkPropertyLimit("starter", 10.9, 1).ok && checkPropertyLimit("starter", 0, 0).ok);
// ---------- team ----------
ok("starter has room for no second person; growth takes the fifth, not the sixth", checkTeamLimit("starter", 1).ok === false && checkTeamLimit("starter", 0).ok === true && checkTeamLimit("growth", 4).ok === true && checkTeamLimit("growth", 5).ok === false);
ok("scale and enterprise have no team limit", checkTeamLimit("scale", 500).ok && checkTeamLimit("enterprise", 500).ok);
ok("the team message names the plan and the way out", /Starter plan allows 1 team member and you have 1/.test((checkTeamLimit("starter", 1) as any).message) && /upgrade/.test((checkTeamLimit("starter", 1) as any).message));
// ---------- every way of adding is guarded (source guards: a path without the check would let the limit be bypassed) ----------
const props = rd("lib/actions/properties.ts"), imp = rd("lib/actions/propertyImport.ts"), match = rd("lib/integrations/matchOrCreateProperty.ts"), proc = rd("lib/integrations/processEvent.ts"), team = rd("lib/actions/team.ts"), db = rd("lib/planLimitsDb.ts"), bill = rd("app/dashboard/settings/billing/page.tsx");
ok("adding a property checks the plan BEFORE it creates it", props.indexOf("assertCanAddProperties(user.companyId, 1)") > 0 && props.indexOf("assertCanAddProperties(user.companyId, 1)") < props.indexOf("prisma.property.create("));
ok("the add-property form shows the limit message (the action returns the error in words)", /return \{ error: err instanceof Error \? err\.message/.test(props));
ok("a spreadsheet import checks the whole batch first, so it is all or nothing", imp.indexOf("assertCanAddProperties(companyId, toCreate.length)") > 0 && imp.indexOf("assertCanAddProperties(companyId, toCreate.length)") < imp.indexOf("prisma.property.createMany"));
ok("an integration cannot create a property past the limit, and says so in its event log instead of crashing", match.indexOf("assertCanAddProperties(companyId, 1)") < match.indexOf("prisma.property.create(") && /instanceof PlanLimitError\) return \{ status: "failed"/.test(proc));
ok("adding AND re-adding a team member are both checked, before anything is written", team.indexOf("assertCanAddTeamMember(companyId)") > 0 && team.indexOf("assertCanAddTeamMember(companyId)") < team.indexOf("prisma.user.findUnique({ where: { email } })"));
ok("no other code creates a property or a staff user", (() => { const out = execSync("grep -rln 'property\\.create\\|property\\.createMany\\|user\\.create(' app lib --include=*.ts --include=*.tsx || true", { encoding: "utf8" }).split("\n").filter(Boolean).sort(); return JSON.stringify(out) === JSON.stringify(["lib/actions/portal.ts", "lib/actions/propertyImport.ts", "lib/actions/properties.ts", "lib/actions/team.ts", "lib/integrations/matchOrCreateProperty.ts"].sort()); })());
ok("only ARCHIVED-free properties count toward the plan", /property\.count\(\{ where: \{ companyId, archivedAt: null \} \}\)/.test(db));
ok("Billing shows 'X of N used' for properties and team members", /of \$\{propLimit\} properties used/.test(bill) && /team member\$\{teamLimit === 1 \? "" : "s"\} used/.test(bill) && /data-testid="plan-usage"/.test(bill));
console.log(`\nPlan limits: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
