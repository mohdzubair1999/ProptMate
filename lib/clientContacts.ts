// Saved clients (Settings, Client details). Checking what was typed, and the database steps, written so they can be tested without a database: the steps take the
// database as a parameter. Every step is limited to ONE company (a client of another company can never be read, changed or removed).

export type ClientInput = { name: string; address: string | null; email: string | null; phone: string | null };
export const LIMITS = { name: 120, address: 500, email: 200, phone: 40 } as const;
const EMAIL = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[^\s@,;<>()[\]]+$/;

export const isValidEmail = (s: unknown): s is string => typeof s === "string" && s.length <= LIMITS.email && EMAIL.test(s.trim());
const text = (v: unknown): string => (typeof v === "string" ? v : "");

export function cleanClientInput(raw: { name?: unknown; address?: unknown; email?: unknown; phone?: unknown } | null | undefined): { ok: true; value: ClientInput } | { ok: false; error: string } {
  const r = raw && typeof raw === "object" ? raw : {};
  const name = text(r.name).replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give the client a name" };
  if (name.length > LIMITS.name) return { ok: false, error: `The name is too long (${LIMITS.name} characters at most)` };
  // an address keeps its line breaks, with spaces tidied and no blank lines at the ends or doubled up
  const address = text(r.address).replace(/\r\n?/g, "\n").split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (address.length > LIMITS.address) return { ok: false, error: `The address is too long (${LIMITS.address} characters at most)` };
  const email = text(r.email).trim().toLowerCase();
  if (email && !isValidEmail(email)) return { ok: false, error: "That doesn't look like a valid email address" };
  const phone = text(r.phone).replace(/\s+/g, " ").trim();
  if (phone && (phone.length > LIMITS.phone || !/^[0-9+()\-\s.]{3,}$/.test(phone))) return { ok: false, error: "A phone number can only have digits, spaces and + ( ) - ." };
  return { ok: true, value: { name, address: address || null, email: email || null, phone: phone || null } };
}

// What a new inspection's summary gets from its property: the client name and address, only the ones that exist
export function inspectionClientFields(property: { landlordName?: unknown; landlordAddress?: unknown } | null | undefined): { clientName?: string; clientAddress?: string } {
  const out: { clientName?: string; clientAddress?: string } = {};
  const name = text(property?.landlordName).trim(), address = text(property?.landlordAddress).trim();
  if (name) out.clientName = name;
  if (address) out.clientAddress = address;
  return out;
}

type Row = Record<string, any>;
export interface ClientDb {
  clientContact: { findMany(a: any): Promise<Row[]>; findFirst(a: any): Promise<Row | null>; create(a: any): Promise<Row>; update(a: any): Promise<Row>; deleteMany(a: any): Promise<{ count: number }> };
  property: { updateMany(a: any): Promise<{ count: number }> };
}
const need = (companyId: unknown): string => { if (typeof companyId !== "string" || !companyId) throw new Error("No company"); return companyId; };

export async function listClients(db: ClientDb, companyId: string | null | undefined): Promise<Row[]> {
  return db.clientContact.findMany({ where: { companyId: need(companyId) }, orderBy: { name: "asc" } });
}

// A saved client of THIS company, or null (an id from another company, or one that does not exist, gives null)
export async function findClient(db: ClientDb, companyId: string | null | undefined, id: unknown): Promise<Row | null> {
  if (typeof id !== "string" || !id) return null;
  return db.clientContact.findFirst({ where: { id, companyId: need(companyId) } });
}

export async function saveClient(db: ClientDb, companyId: string | null | undefined, id: string | null, input: ClientInput): Promise<{ ok: true; client: Row; propertiesUpdated: number } | { ok: false; error: string }> {
  const company = need(companyId);
  const clash = await db.clientContact.findFirst({ where: { companyId: company, name: { equals: input.name, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) } });
  if (clash) return { ok: false, error: `A client called ${clash.name} is already saved` };
  if (!id) return { ok: true, client: await db.clientContact.create({ data: { companyId: company, ...input } }), propertiesUpdated: 0 };
  const own = await db.clientContact.findFirst({ where: { id, companyId: company } });
  if (!own) return { ok: false, error: "That client was not found" };
  const client = await db.clientContact.update({ where: { id }, data: input });
  // properties that belong to this client follow its name and address (so a change is made once)
  const moved = await db.property.updateMany({ where: { companyId: company, clientContactId: id }, data: { landlordName: input.name, landlordAddress: input.address } });
  return { ok: true, client, propertiesUpdated: moved.count };
}

export async function deleteClient(db: ClientDb, companyId: string | null | undefined, id: string): Promise<{ ok: boolean; error?: string }> {
  const company = need(companyId);
  const own = await db.clientContact.findFirst({ where: { id, companyId: company } });
  if (!own) return { ok: false, error: "That client was not found" };
  // the properties keep the name and address that were copied onto them; they just stop following the client
  await db.property.updateMany({ where: { companyId: company, clientContactId: id }, data: { clientContactId: null } });
  await db.clientContact.deleteMany({ where: { id, companyId: company } });
  return { ok: true };
}
