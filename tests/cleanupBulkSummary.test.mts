import { readFileSync } from "node:fs";
import { onlyBlobUrls, chunk } from "../lib/blobUrls";
import { cleanIds } from "../lib/bulkIds";
import { missSummary } from "../lib/aiFeedback";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 300))); };
const rd = (p: string) => readFileSync(p, "utf8");
// ---- which addresses may be deleted ----
const A = "https://abc123.public.blob.vercel-storage.com/photos/a.jpg";
ok("Vercel Blob addresses pass, repeats collapse", JSON.stringify(onlyBlobUrls([A, A, "https://x.blob.vercel-storage.com/y.pdf"])) === JSON.stringify([A, "https://x.blob.vercel-storage.com/y.pdf"]));
ok("outside links, plain http, data addresses, look-alike hosts, junk and non-text are all ignored", onlyBlobUrls(["https://example.com/a.jpg", "http://x.blob.vercel-storage.com/a", "data:image/png;base64,AAAA", "https://blob.vercel-storage.com.evil.com/a", "https://evilblob.vercel-storage.com.attacker.io/a", "not a url", "", null, undefined, 42, {}, "x".repeat(3000)]).length === 0);
ok("chunks: 250 files in batches of 100, and a silly size never loops", chunk(Array.from({ length: 250 }, (_, i) => i), 100).map((c) => c.length).join() === "100,100,50" && chunk([1, 2, 3], 0).length === 3 && chunk([], 5).length === 0);
// ---- every deletion path removes the files too ----
const fc = rd("lib/fileCleanup.ts"), props = rd("lib/actions/properties.ts"), insp = rd("lib/actions/inspections.ts"), acct = rd("lib/actions/account.ts");
ok("the helper finds photos on items and on answers, the report PDF, and the PDFs sent for confirmation", /inspectionItem: \{ inspection: where \}/.test(fc) && /fieldAnswer: \{ inspection: where \}/.test(fc) && /report\.findMany/.test(fc) && /pdfUrlSnapshot/.test(fc));
ok("deleteBlobs never throws and only ever deletes our own storage", /onlyBlobUrls\(urls\)/.test(fc) && /catch \(err\)/.test(fc));
const before = (s: string, a: string, b: string) => s.indexOf(a) > 0 && s.indexOf(b) > s.indexOf(a);
ok("deleting a property lists its files BEFORE the records go and removes them AFTER", before(props, "fileUrlsForInspections({ propertyId })", "prisma.property.delete({ where: { id: propertyId } })") && before(props, "prisma.property.delete({ where: { id: propertyId } })", "await deleteBlobs(fileUrls)"));
ok("permanently deleting an inspection now removes its report PDF too, after the records", /fileUrlsForInspections\(\{ id: inspectionId \}\)/.test(insp) && before(insp, "prisma.inspection.delete({ where: { id: inspectionId } })", "await deleteBlobs(photoUrls)"));
ok("deleting a sole-user account lists the company's files first and removes them after the data is gone", before(acct, "fileUrlsForInspections({ property: { companyId } })", "prisma.company.delete({ where: { id: companyId } })") && before(acct, "prisma.company.delete({ where: { id: companyId } })", "await deleteBlobs(fileUrls)"));
ok("a team member leaving does NOT delete the company's files", acct.indexOf("await deleteBlobs(fileUrls)") < acct.indexOf("} else {"));
// ---- bulk archive ----
ok("ids: text only, trimmed, no blanks or repeats, capped", JSON.stringify(cleanIds(["a", " b ", "a", "", 5, null, "c"])) === JSON.stringify(["a", "b", "c"]) && cleanIds(Array.from({ length: 900 }, (_, i) => "id" + i)).length === 500 && cleanIds("x").length === 0 && cleanIds(undefined).length === 0 && cleanIds(["x".repeat(65)]).length === 0);
ok("bulk archive only touches the signed-in company's active properties", /archiveProperties[\s\S]*?id: \{ in: ids \}, companyId: user\.companyId, archivedAt: null/.test(props));
ok("bulk restore refuses the WHOLE batch when it will not fit on the plan, and checks before changing anything", /checkPropertyLimit\(company\?\.planTier, await activePropertyCount\(user\.companyId\), own\.length\)/.test(props) && before(props, "if (!r.ok) throw new Error(r.message);\n  await prisma.property.updateMany({ where: { id: { in: own.map", "action: \"property.restored\", entityType: \"Property\", entityId: own[0].id"));
const list = rd("app/dashboard/properties/page.tsx");
ok("the list has a tick box per row, tick-all, and one confirm button that archives or restores", /name="propertyIds" value=\{p\.id\} form="bulk-form"/.test(list) && /<SelectAllCheckbox formId="bulk-form"/.test(list) && /showArchived \? restoreProperties : archiveProperties/.test(list));
// ---- miss rate ----
const s = missSummary([{ kind: "small_mark" }, { kind: "small_mark" }, { kind: "item" }, { kind: "zzz" }], 40);
ok("rate per 100 analyses, with kinds counted (unknown kinds count as other)", s.reports === 4 && s.analyses === 40 && s.per100 === 10 && s.byKind.small_mark === 2 && s.byKind.item === 1 && s.byKind.other === 1);
ok("no analyses means no rate (not a divide by zero)", missSummary([{ kind: "item" }], 0).per100 === null && missSummary([], NaN as any).per100 === null && missSummary([], 5).per100 === 0);
ok("the page states that only reported misses are counted", /floor, not the true figure/.test(rd("app/dashboard/settings/ai-feedback/page.tsx")));
console.log(`\nFile cleanup, bulk archive, miss rate: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
