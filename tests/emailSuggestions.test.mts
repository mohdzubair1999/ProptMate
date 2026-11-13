import { buildSuggestions as B, suggestFor as S, recipientsToRemember as R, loadSuggestions, rememberRecipients, forgetRecipient, normaliseEmail, sourceLabel } from "../lib/emailSuggestions";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 500))); };
const list = B({ recent: [{ email: "Joe.Bloggs@Gmail.com", name: null }, { email: "kim@lettings.co.uk" }], clients: [{ name: "Joe Bloggs", email: "joe.bloggs@gmail.com" }, { name: "Acme Lettings", email: "info@acme.co.uk" }, { name: "No email" }, { name: "Bad", email: "not-an-email" }], portal: [{ name: "Sam Tenant", email: "sam@outlook.com" }], team: [{ name: "Zubair", email: "zubair@zkm.co.uk" }, { name: null, email: "info@acme.co.uk" }] });
ok("one list, no address twice, all lower case, bad and missing addresses dropped", list.length === 5 && new Set(list.map((s) => s.email)).size === 5 && list.every((s) => s.email === s.email.toLowerCase()) && !list.some((s) => s.email === "not-an-email"), list);
ok("addresses used before come first, then clients, portal, team", list.map((s) => s.email).join() === "joe.bloggs@gmail.com,kim@lettings.co.uk,info@acme.co.uk,sam@outlook.com,zubair@zkm.co.uk", list.map((s) => s.email));
ok("a name is taken from wherever it is known (Joe's name comes from the saved client, though he was first seen in 'used before'), and the label shown is the most useful place (saved client beats used before and team)", list[0].name === "Joe Bloggs" && list[0].source === "client" && list.find((s) => s.email === "info@acme.co.uk")!.source === "client" && list.find((s) => s.email === "kim@lettings.co.uk")!.source === "recent");
ok("the list is capped", B({ clients: Array.from({ length: 50 }, (_, i) => ({ name: `N${i}`, email: `n${i}@x.co` })) }, 10).length === 10 && B({ clients: [{ email: "a@b.co" }] }, -5).length === 1);
ok("junk never throws", [null, undefined, {}, { clients: "x" }, { clients: [null, 5, "x", {}] }, { team: [{ email: 5 }] }].every((x) => { try { return Array.isArray(B(x as any)); } catch { return false; } }));
const ids = (q: string, o?: any) => S(list, q, o).map((s) => s.email).join();
ok("a few letters find the address: 'jo' finds joe.bloggs, 'info' finds acme, 'sam' finds sam", ids("jo") === "joe.bloggs@gmail.com" && ids("info") === "info@acme.co.uk" && ids("sam") === "sam@outlook.com");
ok("the NAME finds the address too: 'bloggs', 'acme', 'tenant'", ids("bloggs") === "joe.bloggs@gmail.com" && ids("acme") === "info@acme.co.uk" && ids("tenant") === "sam@outlook.com");
ok("the domain finds it: 'gmail' and 'outlook' and '@zkm'", ids("gmail") === "joe.bloggs@gmail.com" && ids("outlook") === "sam@outlook.com" && ids("@zkm") === "zubair@zkm.co.uk");
ok("words in any order and typed in capitals", ids("BLOGGS joe") === "joe.bloggs@gmail.com");
ok("nothing typed gives nothing (no list until you start typing), and junk gives nothing", ids("") === "" && ids("   ") === "" && S(list, null as any).length === 0 && S(null as any, "jo").length === 0 && ids("zzzz") === "");
ok("an address already chosen is not suggested again", ids("jo", { exclude: ["Joe.Bloggs@gmail.com"] }) === "" && ids("a", { exclude: ["info@acme.co.uk"] }).split(",").includes("info@acme.co.uk") === false);
ok("what you have typed in full is not suggested back to you", ids("sam@outlook.com") === "");
ok("at most 6 are suggested by default, or the limit given (never more than 20)", S(B({ clients: Array.from({ length: 40 }, (_, i) => ({ name: `Tenant ${i}`, email: `t${i}@x.co` })) }), "t").length === 6 && S(B({ clients: Array.from({ length: 40 }, (_, i) => ({ name: `Tenant ${i}`, email: `t${i}@x.co` })) }), "t", { limit: 3 }).length === 3 && S(B({ clients: Array.from({ length: 40 }, (_, i) => ({ name: `Tenant ${i}`, email: `t${i}@x.co` })) }), "t", { limit: 99 }).length === 20);
ok("the one that starts with what you typed comes before ones that only contain it", S(B({ clients: [{ name: "X", email: "my.kim@x.co" }, { name: "Y", email: "kim@y.co" }] }), "kim").map((s) => s.email).join() === "kim@y.co,my.kim@x.co");
ok("normalising and labels", normaliseEmail("  A@B.CO ") === "a@b.co" && normaliseEmail(5 as any) === "" && sourceLabel("recent") === "Used before" && sourceLabel("client") === "Saved client");
ok("remembering: valid, lower case, no repeats, at most 20", R(["A@b.co", "a@b.co", "bad", "c@d.co", 5, null]).join() === "a@b.co,c@d.co" && R(Array.from({ length: 40 }, (_, i) => `u${i}@x.co`)).length === 20 && R("x" as any).length === 0 && R(null as any).length === 0);
// ---------- the database steps, with two companies ----------
function makeDb() {
  const t = { client: [{ companyId: "A", name: "Acme", email: "info@acme.co.uk" }, { companyId: "A", name: "NoMail", email: null }, { companyId: "B", name: "Other Co", email: "boss@other.co" }] as any[], user: [{ companyId: "A", name: "Zubair", email: "zubair@zkm.co.uk" }, { companyId: "B", name: "Bee", email: "bee@other.co" }] as any[], access: [{ property: { companyId: "A" }, user: { name: "Sam", email: "sam@outlook.com" } }, { property: { companyId: "B" }, user: { name: "Bob", email: "bob@other.co" } }] as any[], sent: [] as any[] };
  const calls: any[] = [];
  const db: any = {
    clientContact: { findMany: async (a: any) => { calls.push(["client", a.where]); return t.client.filter((r) => r.companyId === a.where.companyId && (a.where.email?.not === null ? r.email != null : true)); } },
    propertyAccess: { findMany: async (a: any) => { calls.push(["access", a.where]); return t.access.filter((r) => r.property.companyId === a.where.property.companyId); } },
    user: { findMany: async (a: any) => { calls.push(["user", a.where]); return t.user.filter((r) => r.companyId === a.where.companyId); } },
    sentRecipient: {
      findMany: async (a: any) => { calls.push(["sent", a.where]); return t.sent.filter((r) => r.companyId === a.where.companyId).sort((x, y) => +y.lastUsedAt - +x.lastUsedAt); },
      upsert: async (a: any) => { const k = a.where.companyId_email; if (k.email.startsWith("boom")) throw new Error("db"); const r = t.sent.find((x) => x.companyId === k.companyId && x.email === k.email); if (r) { r.useCount += a.update.useCount.increment; r.lastUsedAt = a.update.lastUsedAt; if (a.update.name) r.name = a.update.name; return r; } const n = { id: `s${t.sent.length + 1}`, ...a.create }; t.sent.push(n); return n; },
      deleteMany: async (a: any) => { const b = t.sent.length; t.sent = t.sent.filter((r) => !(r.id === a.where.id && r.companyId === a.where.companyId)); return { count: b - t.sent.length }; },
    },
  };
  return { db, t, calls };
}
{ const { db, t, calls } = makeDb();
  const mine = await loadSuggestions(db, "A");
  ok("the suggestions for a company come from ITS saved clients (with an email), its portal clients and its team, and nothing of another company's", mine.map((s) => s.email).sort().join() === "info@acme.co.uk,sam@outlook.com,zubair@zkm.co.uk" && !mine.some((s) => /other\.co/.test(s.email)), mine);
  ok("every database question was limited to the company (not one of them is open to all companies)", calls.length === 4 && calls.every(([, w]) => w.companyId === "A" || w.property?.companyId === "A"), calls);
  ok("it needs a company", await loadSuggestions(db, null).then(() => false, () => true) && await loadSuggestions(db, "").then(() => false, () => true));
  const t0 = new Date("2026-11-01T10:00:00Z"), t1 = new Date("2026-11-05T10:00:00Z");
  ok("remembering counts the addresses, ignoring invalid ones", (await rememberRecipients(db, "A", ["Kim@Lettings.co.uk", "bad", "kim@lettings.co.uk", "lee@x.co"], { "kim@lettings.co.uk": "Kim Lee" }, t0)) === 2 && t.sent.length === 2 && t.sent[0].email === "kim@lettings.co.uk" && t.sent[0].name === "Kim Lee" && t.sent[0].companyId === "A");
  await rememberRecipients(db, "A", ["kim@lettings.co.uk"], {}, t1);
  ok("sending to the same address again counts the use and updates the time, and keeps the name", t.sent[0].useCount === 2 && +t.sent[0].lastUsedAt === +t1 && t.sent[0].name === "Kim Lee");
  ok("one address that cannot be saved does not stop the others or throw", (await rememberRecipients(db, "A", ["boom@x.co", "ok@x.co"], {}, t1)) === 1 && t.sent.some((r) => r.email === "ok@x.co"));
  await rememberRecipients(db, "B", ["kim@lettings.co.uk"], {}, t1);
  ok("two companies remembering the same address keep it separately", t.sent.filter((r) => r.email === "kim@lettings.co.uk").map((r) => r.companyId).sort().join() === "A,B");
  const after = await loadSuggestions(db, "A");
  ok("an address that has been used appears in the suggestions, the most recently used first", after[0].email === "kim@lettings.co.uk" && after[0].name === "Kim Lee" && after[0].source === "recent" && S(after, "kim")[0].email === "kim@lettings.co.uk");
  const id = t.sent.find((r) => r.companyId === "A")!.id;
  ok("another company cannot forget this company's remembered address", (await forgetRecipient(db, "B", id)) === false && t.sent.some((r) => r.id === id));
  ok("this company can forget it, and it is no longer suggested", (await forgetRecipient(db, "A", id)) === true && !(await loadSuggestions(db, "A")).some((s) => s.email === t.sent.find((r) => r.id === id)?.email) );
  ok("remembering with no company never reaches the database", await rememberRecipients(db, null, ["a@b.co"]).then(() => false, () => true)); }
console.log(`\nEmail suggestions: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
