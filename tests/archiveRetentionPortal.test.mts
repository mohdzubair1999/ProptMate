import { readFileSync } from "node:fs";
import { planCleanup, retentionCutoff, REPORT_RETENTION_DAYS } from "../lib/reportRetention";
import { portalState, portalStateLabel } from "../lib/portalState";
import { shouldPromptSendUpdated } from "../lib/reportDates";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
const rd = (p: string) => readFileSync(p, "utf8");
const NOW = new Date("2026-11-14T12:00:00Z"); const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);
// ---------- old report PDFs: 90 days ----------
ok("retention is 90 days and the cutoff is exactly that far back", REPORT_RETENTION_DAYS === 90 && retentionCutoff(NOW).getTime() === daysAgo(90).getTime());
const rows = [{ id: "a", url: "u/old", supersededAt: daysAgo(120) }, { id: "b", url: "u/recent", supersededAt: daysAgo(10) }, { id: "c", url: "u/sent", supersededAt: daysAgo(200) }, { id: "d", url: "u/edge", supersededAt: daysAgo(90) }, { id: "e", url: "u/bad", supersededAt: "not a date" }];
const plan = planCleanup(rows, ["u/sent"], NOW);
ok("old and unprotected are removed (including exactly 90 days)", plan.remove.map((r) => r.id).sort().join() === "a,d", plan);
ok("one a confirmation request points at is kept for good, however old", plan.keep.map((r) => r.id).join() === "c");
ok("recent and unreadable-date rows are left alone", !plan.remove.concat(plan.keep).some((r) => r.id === "b" || r.id === "e"));
ok("a current report's file is protected the same way", planCleanup([rows[0]], new Set(["u/old"]), NOW).remove.length === 0);
const cl = rd("lib/reportCleanup.ts"), rep = rd("lib/actions/reports.ts"), cron = rd("app/api/cron/report-cleanup/route.ts"), vj = rd("vercel.json"), sch = rd("prisma/schema.prisma");
ok("the clean-up reads both the confirmation snapshots and the current reports before deleting anything", /reportAcknowledgement\.findMany\(\{ where: \{ pdfUrlSnapshot: \{ in: urls \}/.test(cl) && /report\.findMany\(\{ where: \{ pdfUrl: \{ in: urls \}/.test(cl) && cl.indexOf("planCleanup(rows, protectedUrls") < cl.indexOf("await del(r.url)"));
ok("a failed delete stays in the list to retry, and a row is dropped only after its file is", cl.indexOf("await del(r.url)") < cl.indexOf("supersededReportPdf.delete({ where: { id: r.id } })") && /failed\+\+/.test(cl));
ok("generating and deleting a report note the replaced file; report generation itself never deletes files", /rememberSupersededPdf\(earlier\?\.pdfUrl, blob\.url\)/.test(rep) && /rememberSupersededPdf\(removed\?\.pdfUrl, null\)/.test(rep) && !/\bdel\(/.test(rep));
ok("noting a replaced file never throws, and ignores the same address", /catch \(err\)/.test(cl.split("runReportCleanup")[0]) && /oldUrl === newUrl/.test(cl));
ok("the cron route needs the secret and runs daily", /hasCronSecret\(authHeader\)/.test(cron) && /report-cleanup/.test(vj) && /compliance-alerts/.test(vj));
ok("the schema has the clean-up list, with no relation that could cascade", /model SupersededReportPdf \{[^}]*url\s+String\s+@unique[^}]*\}/.test(sch) && !/SupersededReportPdf[^}]*@relation/.test(sch));
// ---------- tenant portal while editing ----------
ok("never completed = pending; completed = completed; re-opened after completing = updating", portalState({ status: "draft" }) === "pending" && portalState({ status: "draft", firstCompletedDate: null }) === "pending" && portalState({ status: "completed", firstCompletedDate: NOW }) === "completed" && portalState({ status: "draft", firstCompletedDate: NOW }) === "updating");
ok("the label for updating says the agent is editing", portalStateLabel("updating") === "Being updated by your agent");
const pp = rd("app/portal/page.tsx"), pi = rd("app/portal/inspections/[id]/page.tsx"), ia = rd("lib/actions/inspections.ts");
ok("a re-opened inspection stays with the completed ones, not 'forms to complete'", /pending = assignedInspections\.filter\(\(i\) => portalState\(i\) === "pending"\)/.test(pp) && /completed = assignedInspections\.filter\(\(i\) => portalState\(i\) !== "pending"\)/.test(pp));
ok("its page is read-only (no Submit), with a note, and 'Submitted' only when really completed", /const isDraft = state === "pending"/.test(pi) && /data-testid="portal-updating"/.test(pi) && /state === "completed" &&/.test(pi));
ok("a tenant cannot complete a copy the agent re-opened (server side, not just hidden)", /user\.role === "CLIENT" && owned\.firstCompletedDate\) redirect/.test(ia));
// ---------- send the updated report ----------
const gen = new Date("2026-11-12T10:00:00Z"), sent = new Date("2026-11-10T09:00:00Z"), comp = new Date("2026-11-12T09:59:00Z");
ok("edited, regenerated, and last sent BEFORE the new report: prompt", shouldPromptSendUpdated({ amendmentCount: 1, generatedAt: gen, completedDate: comp, lastSentAt: sent }) === true);
ok("already sent after regenerating: no prompt", shouldPromptSendUpdated({ amendmentCount: 1, generatedAt: gen, completedDate: comp, lastSentAt: new Date("2026-11-12T11:00:00Z") }) === false);
ok("never sent: no prompt", shouldPromptSendUpdated({ amendmentCount: 1, generatedAt: gen, completedDate: comp, lastSentAt: null }) === false);
ok("never edited: no prompt", shouldPromptSendUpdated({ amendmentCount: 0, generatedAt: gen, completedDate: comp, lastSentAt: sent }) === false);
ok("report still older than the edits: no prompt (regenerate first)", shouldPromptSendUpdated({ amendmentCount: 2, generatedAt: gen, completedDate: new Date("2026-11-13T00:00:00Z"), lastSentAt: sent }) === false);
ok("junk input never prompts or throws", shouldPromptSendUpdated({}) === false && shouldPromptSendUpdated({ amendmentCount: "x", generatedAt: "no", lastSentAt: "no" }) === false);
const pg = rd("app/dashboard/inspections/[id]/page.tsx"), sr = rd("app/api/email/send-report/route.ts");
ok("the page uses the last send (confirmation request or plain email) and shows the note with the date and prefilled earlier recipients", /action: "report\.sent"/.test(pg) && /data-testid="send-updated"/.test(pg) && /initialRecipients=\{sendRecipients\}/.test(pg) && /previousRecipients/.test(pg));
ok("a plain email send is recorded, without ever failing the send", /action: "report\.sent"/.test(sr) && /catch \{\s*\/\* ignored on purpose \*\//.test(sr.slice(sr.indexOf("report.sent") - 200)));
// ---------- archive ----------
const pr = rd("lib/actions/properties.ts"), list = rd("app/dashboard/properties/page.tsx"), det = rd("app/dashboard/properties/[id]/page.tsx");
ok("the schema has archivedAt, and it is optional (additive: safe for existing data)", /archivedAt\s+DateTime\?/.test(sch));
ok("archive and restore only touch the signed-in company's own property", /updateMany\(\{ where: \{ id: propertyId, companyId: user\.companyId, archivedAt: null \}/.test(pr) && /findFirst\(\{ where: \{ id: propertyId, companyId: user\.companyId, archivedAt: \{ not: null \} \}/.test(pr));
ok("restoring takes a place on the plan, so it is refused when the plan is full", /checkPropertyLimit\(company\?\.planTier, await activePropertyCount\(user\.companyId\), 1\)/.test(pr) && pr.indexOf("if (!r.ok) throw new Error(r.message)") < pr.indexOf("data: { archivedAt: null }"));
ok("both are in the audit log", /property\.archived/.test(pr) && /property\.restored/.test(pr));
ok("the properties page hides archived by default, shows them on request, and counts only active ones against the plan", /showArchived \? \{ archivedAt: \{ not: null \} \} : \{ archivedAt: null \}/.test(list) && /view-archived/.test(list) && /on your plan/.test(list));
ok("the property page shows an archived banner and Restore, and no New inspection", /data-testid="archived-banner"/.test(det) && /data-testid="restore-property"/.test(det));
const hidden: [string, RegExp][] = [["app/dashboard/page.tsx", /property\.count\(\{ where: \{ companyId, archivedAt: null \} \}\)/], ["app/dashboard/floor-plans/page.tsx", /archivedAt: null, \.\.\.propertySearchFilter/], ["app/dashboard/inspections/new/page.tsx", /where: \{ companyId, archivedAt: null \}/], ["app/dashboard/compliance/page.tsx", /archivedAt: null/], ["app/dashboard/tenants/page.tsx", /archivedAt: null/], ["lib/dueInspections.ts", /archivedAt: null/], ["app/api/cron/compliance-alerts/route.ts", /where: \{ archivedAt: null \}/]];
for (const [f, re] of hidden) ok(`archived properties are left out of ${f}`, re.test(rd(f)), f);
ok("a new inspection cannot be started on an archived property (server side)", /if \(property\.archivedAt\) return \{ error: "This property is archived/.test(ia));
ok("an integration will not schedule onto an archived property", /property\?\.archivedAt\) return \{ status: "failed"/.test(rd("lib/integrations/processEvent.ts")));
ok("delete is still there for a permanent removal", /deleteProperty/.test(list));
// ---------- help captions ----------
const help = rd("app/help/help-content.tsx");
ok("no Help video caption or title still says Amend", !/amend/i.test(help.split('["amend"')[0].replace(/id="amend"/g, "")), (help.match(/.*amend.*/gi) || []).join(" | "));
ok("Help explains the send-updated prompt", /a blue note appears once the new one is ready/.test(help));
console.log(`\nArchive, PDF clean-up, portal, resend prompt, captions: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
