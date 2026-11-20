import { cleanClientInput as C, inspectionClientFields as F, saveClient, deleteClient, findClient, listClients, isValidEmail, type ClientDb } from "../lib/clientContacts";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 500))); };
// ---------- a small in-memory database ----------
function match(row: any, where: any): boolean {
  for (const [k, v] of Object.entries(where ?? {})) {
    if (k === "NOT") { if (match(row, v)) return false; continue; }
    if (v && typeof v === "object" && "equals" in (v as any)) { const a = String(row[k] ?? ""), b = String((v as any).equals); if ((v as any).mode === "insensitive" ? a.toLowerCase() !== b.toLowerCase() : a !== b) return false; continue; }
    if (v && typeof v === "object" && "not" in (v as any)) { if ((v as any).not === null ? row[k] == null : row[k] === (v as any).not) return false; continue; }
    if (row[k] !== v) return false;
  }
  return true;
}
function makeDb() {
  const t = { clientContact: [] as any[], property: [] as any[] }; let n = 0;
  const db: ClientDb = {
    clientContact: {
      findMany: async (a: any) => t.clientContact.filter((r) => match(r, a.where)).sort((x, y) => x.name.localeCompare(y.name)).map((r) => ({ ...r })),
      findFirst: async (a: any) => { const r = t.clientContact.find((x) => match(x, a.where)); return r ? { ...r } : null; },
      create: async (a: any) => { const r = { id: `c${++n}`, ...a.data }; t.clientContact.push(r); return { ...r }; },
      update: async (a: any) => { const r = t.clientContact.find((x) => x.id === a.where.id)!; Object.assign(r, a.data); return { ...r }; },
      deleteMany: async (a: any) => { const before = t.clientContact.length; t.clientContact = t.clientContact.filter((r) => !match(r, a.where)); return { count: before - t.clientContact.length }; },
    },
    property: { updateMany: async (a: any) => { let c = 0; for (const r of t.property) if (match(r, a.where)) { Object.assign(r, a.data); c++; } return { count: c }; } },
  };
  return { db, t };
}
const IN = (o: any = {}) => ({ name: "Acme Lettings", address: "1 High St\nLondon", email: "info@acme.co.uk", phone: "020 7946 0000", ...o });
// ---------- checking what was typed ----------
const v = C({ name: "  Acme   Lettings ", address: " 1 High St  \r\n\r\n\r\n\r\n  London \n", email: " INFO@Acme.CO.UK ", phone: " 020  7946 0000 " }) as any;
ok("a client is tidied: spaces collapsed, address lines kept but tidied with no blank lines at the ends or more than one in a row, email lower case, phone spaces tidied", v.ok && v.value.name === "Acme Lettings" && v.value.address === "1 High St\n\nLondon" && v.value.email === "info@acme.co.uk" && v.value.phone === "020 7946 0000", v);
ok("only the name is needed; empty address, email and phone become nothing", (() => { const r = C({ name: "Mr Patel", address: "  ", email: "", phone: "" }) as any; return r.ok && r.value.address === null && r.value.email === null && r.value.phone === null; })());
ok("a missing or blank name is refused", [{}, { name: "" }, { name: "   " }, { name: null }, { name: 5 }, null, undefined, "x", []].every((x) => { const r = C(x as any) as any; return !r.ok && r.error === "Give the client a name"; }));
ok("an over-long name (121) or address (501) is refused with a clear message; the limit itself is allowed", !(C({ name: "a".repeat(121) }) as any).ok && /120/.test((C({ name: "a".repeat(121) }) as any).error) && (C({ name: "a".repeat(120) }) as any).ok && !(C({ name: "A", address: "x".repeat(501) }) as any).ok && (C({ name: "A", address: "x".repeat(500) }) as any).ok);
ok("a bad email is refused: no @, no dot, spaces, two addresses, angle brackets", ["plain", "a@b", "a b@c.com", "a@b.com, c@d.com", "<a@b.com>", "a@@b.com", "@b.com", "a@.com"].every((e) => !(C({ name: "A", email: e }) as any).ok) && ["a@b.co", "first.last+tag@sub.domain.org", "A@B.CO"].every((e) => (C({ name: "A", email: e }) as any).ok));
ok("a phone number may have digits, spaces and + ( ) - . only", ["020 7946 0000", "+44 (0)20 7946 0000", "07700-900123", "01234.567890"].every((p) => (C({ name: "A", phone: p }) as any).ok) && ["call me", "0207 abc", "020; DROP TABLE", "1", "1".repeat(41)].every((p) => !(C({ name: "A", phone: p }) as any).ok));
ok("the validator for emails agrees (and never throws on junk)", isValidEmail("a@b.co") && !isValidEmail("a@b") && !isValidEmail(5 as any) && !isValidEmail(null as any) && !isValidEmail("a@b.co".padEnd(201, "x")));
// ---------- what a new inspection gets ----------
ok("a new inspection's summary gets the property's client name and address, only the ones that exist, tidied", JSON.stringify(F({ landlordName: " Acme ", landlordAddress: "1 High St" })) === '{"clientName":"Acme","clientAddress":"1 High St"}' && JSON.stringify(F({ landlordName: "Acme", landlordAddress: null })) === '{"clientName":"Acme"}' && JSON.stringify(F({ landlordName: "", landlordAddress: "   " })) === "{}" && JSON.stringify(F(null)) === "{}" && JSON.stringify(F({ landlordName: 5 as any })) === "{}");
// ---------- saving, with company limits ----------
{ const { db, t } = makeDb(); const a = (await saveClient(db, "A", null, IN())) as any;
  ok("a new client is saved to the company that saved it", a.ok && t.clientContact.length === 1 && t.clientContact[0].companyId === "A" && t.clientContact[0].name === "Acme Lettings");
  ok("the same name again is refused, in any capitals, with a message naming it", !(await saveClient(db, "A", null, IN({ name: "ACME lettings" })) as any).ok && /already saved/.test(((await saveClient(db, "A", null, IN({ name: "acme LETTINGS" }))) as any).error) && t.clientContact.length === 1);
  const b = (await saveClient(db, "B", null, IN())) as any; ok("ANOTHER company may have a client of the same name (the rule is per company)", b.ok && t.clientContact.length === 2 && t.clientContact[1].companyId === "B");
  t.property.push({ id: "p1", companyId: "A", clientContactId: a.client.id, landlordName: "Acme Lettings", landlordAddress: "old" }, { id: "p2", companyId: "A", clientContactId: null, landlordName: "Manual", landlordAddress: "m" }, { id: "p3", companyId: "B", clientContactId: b.client.id, landlordName: "Acme Lettings", landlordAddress: "b" }, { id: "p4", companyId: "A", clientContactId: "someone-else", landlordName: "Other", landlordAddress: "o" });
  const u = (await saveClient(db, "A", a.client.id, IN({ name: "Acme Group", address: "2 New Rd" }))) as any;
  ok("editing a client updates it, and says how many properties followed", u.ok && t.clientContact[0].name === "Acme Group" && u.propertiesUpdated === 1);
  ok("the properties that belong to that client follow its new name and address, and NO other property changes (not one with no client, not another client's, not another company's)", t.property[0].landlordName === "Acme Group" && t.property[0].landlordAddress === "2 New Rd" && t.property[1].landlordName === "Manual" && t.property[2].landlordName === "Acme Lettings" && t.property[2].landlordAddress === "b" && t.property[3].landlordName === "Other");
  ok("another company cannot edit this client: it says not found and nothing changes", (await saveClient(db, "B", a.client.id, IN({ name: "Hacked" })) as any).ok === false && t.clientContact[0].name === "Acme Group" && t.property[0].landlordName === "Acme Group");
  const c2 = (await saveClient(db, "A", null, IN({ name: "Brown & Co" }))) as any;
  ok("renaming onto another client's name is refused; saving with its own name is fine", !(await saveClient(db, "A", c2.client.id, IN({ name: "acme group" })) as any).ok && (await saveClient(db, "A", c2.client.id, IN({ name: "Brown & Co", phone: null })) as any).ok);
  ok("saving with no company never reaches the database", await saveClient(db, null, null, IN()).then(() => false, () => true) && await saveClient(db, "", null, IN()).then(() => false, () => true) && t.clientContact.length === 3);
  ok("finding a client: its own company gets it, another company, an empty id or junk gets nothing", (await findClient(db, "A", a.client.id)) !== null && (await findClient(db, "B", a.client.id)) === null && (await findClient(db, "A", "")) === null && (await findClient(db, "A", 5)) === null && (await findClient(db, "A", "nope")) === null);
  ok("the list is the company's own, A to Z, and needs a company", (await listClients(db, "A")).map((r: any) => r.name).join() === "Acme Group,Brown & Co" && (await listClients(db, "B")).length === 1 && await listClients(db, undefined).then(() => false, () => true));
  // ---------- deleting ----------
  ok("another company cannot delete it", (await deleteClient(db, "B", a.client.id)).ok === false && t.clientContact.some((r) => r.id === a.client.id));
  const d = await deleteClient(db, "A", a.client.id);
  ok("deleting a client removes it, and the properties KEEP the name and address that were copied onto them (they just stop following it)", d.ok && !t.clientContact.some((r) => r.id === a.client.id) && t.property[0].clientContactId === null && t.property[0].landlordName === "Acme Group" && t.property[0].landlordAddress === "2 New Rd" && t.property[2].clientContactId === b.client.id);
  ok("deleting one that is already gone says so", (await deleteClient(db, "A", a.client.id)).ok === false); }
// ---------- random: companies never touch each other's clients, properties follow their client ----------
{ let seed = 5, bad = 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; const { db, t } = makeDb(); const cos = ["A", "B", "C"];
  for (let i = 0; i < 400; i++) { const co = cos[Math.floor(rnd() * 3)], op = rnd();
    if (op < 0.4) await saveClient(db, co, null, IN({ name: `Client ${Math.floor(rnd() * 12)}` }));
    else if (op < 0.7 && t.clientContact.length) { const c = t.clientContact[Math.floor(rnd() * t.clientContact.length)]; const before = t.clientContact.map((r) => ({ ...r })); await saveClient(db, co, c.id, IN({ name: `Client ${Math.floor(rnd() * 12)}`, address: `Addr ${i}` })); if (c.companyId !== co) { if (JSON.stringify(before) !== JSON.stringify(t.clientContact)) bad++; } }
    else if (op < 0.85 && t.clientContact.length) { const c = t.clientContact[Math.floor(rnd() * t.clientContact.length)]; const had = c.companyId === co; const n = t.clientContact.length; await deleteClient(db, co, c.id); if (!had && t.clientContact.length !== n) bad++; }
    else if (t.clientContact.length) { const c = t.clientContact[Math.floor(rnd() * t.clientContact.length)]; t.property.push({ id: `p${i}`, companyId: c.companyId, clientContactId: c.id, landlordName: c.name, landlordAddress: c.address }); }
    for (const c of t.clientContact) for (const p of t.property) if (p.clientContactId === c.id && (p.landlordName !== c.name || p.landlordAddress !== c.address || p.companyId !== c.companyId)) bad++;
    const names = new Map<string, number>(); for (const c of t.clientContact) { const k = `${c.companyId}|${c.name.toLowerCase()}`; names.set(k, (names.get(k) ?? 0) + 1); } if ([...names.values()].some((x) => x > 1)) bad++; }
  ok("400 random saves, edits, deletes and property links across three companies: no company ever changes another's clients, no company has two clients with the same name, and every linked property always shows its client's current name and address", bad === 0, bad); }
console.log(`\nSaved clients: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
