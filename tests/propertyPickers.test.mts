import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { propertySearchFilter as S, MAX_SEARCH_CHARS } from "../lib/propertySearch";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
// ---------- the search rule ----------
const f: any = S("tudor");
ok("searching 'tudor' looks in the address, the city, the postcode and the landlord's name, ignoring capitals", f.OR.length === 4 && ["address", "city", "postcode", "landlordName"].every((k, i) => f.OR[i][k]?.contains === "tudor" && f.OR[i][k].mode === "insensitive"));
ok("nothing typed, only spaces, or junk gives NO filter (everything is listed)", [undefined, null, "", "   ", 5, {}, [], true].every((q) => Object.keys(S(q as any)).length === 0));
ok("spaces around the text are removed, the text inside is kept as typed", (S("  2 Tudor  House ") as any).OR[0].address.contains === "2 Tudor  House");
ok(`a huge paste is cut to ${MAX_SEARCH_CHARS} characters`, (S("x".repeat(5000)) as any).OR[0].address.contains.length === MAX_SEARCH_CHARS && MAX_SEARCH_CHARS === 100);
ok("it is the same four fields the Properties page searches (so the two lists find the same things)", (() => { const page = readFileSync("app/dashboard/properties/page.tsx", "utf8"); return ["address", "city", "postcode", "landlordName"].every((k) => new RegExp(`${k}: \\{ contains: q, mode: "insensitive" \\}`).test(page)); })());
// ---------- where the search boxes are ----------
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : []; });
const files = walk("app").concat(walk("components")).map((p) => [p, readFileSync(p, "utf8")] as const);
const withSelect = files.filter(([, s]) => /<select[^>]*name="propertyId"/.test(s) || /name="propertyId"[\s\S]{0,120}?<option/.test(s) && /<select/.test(s)).map(([p]) => p);
ok("no plain drop-down for choosing a property is left anywhere (a long list of properties must be searchable)", withSelect.length === 0, withSelect);
const pickers = files.filter(([, s]) => /<SearchableSelect[\s\S]{0,200}name="propertyId"/.test(s)).map(([p]) => p).sort();
ok("the three places that choose a property use the searchable picker: new inspection, compliance document, invite client", pickers.join() === ["app/dashboard/compliance/add-document-form.tsx", "app/dashboard/inspections/new/new-inspection-form.tsx", "app/dashboard/tenants/invite-client-form.tsx"].join(), pickers);
ok("each of them is given the postcode and landlord to search by, not only the address (the pages ask for those fields)", ["app/dashboard/inspections/new/page.tsx", "app/dashboard/compliance/page.tsx", "app/dashboard/tenants/page.tsx"].every((p) => /postcode: true, landlordName: true/.test(readFileSync(p, "utf8"))));
const fp = readFileSync("app/dashboard/floor-plans/page.tsx", "utf8");
ok("the Floor Plans list has a search box, searches with the shared rule, keeps the company's own properties only, and lists at most 100 at a time", /<SearchFilterBar/.test(fp) && /propertySearchFilter\(q\)/.test(fp) && /companyId: companyId \?\? ""/.test(fp) && /take: PAGE/.test(fp) && /const PAGE = 100/.test(fp));
ok("the Floor Plans list says when nothing matches, and when only the first 100 are shown", /no-matching-properties/.test(fp) && /floor-plans-limit/.test(fp));
const list = ["app/dashboard/properties/page.tsx", "app/dashboard/inspections/page.tsx", "app/dashboard/tenants/page.tsx", "app/dashboard/compliance/page.tsx", "app/dashboard/floor-plans/page.tsx"];
ok("every long list page has a search bar: properties, inspections, tenants, compliance and floor plans", list.every((p) => /SearchFilterBar/.test(readFileSync(p, "utf8"))), list.filter((p) => !/SearchFilterBar/.test(readFileSync(p, "utf8"))));
console.log(`\nProperty search: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
