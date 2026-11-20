import { findClient, type ClientDb } from "./clientContacts";

// What a property form says about its client, and what must be written. Kept separate from the form action so it can be tested: this is exactly where editing a
// property used to blank its client name and address (the edit form sent neither, and they were written as empty).
type FormLike = { has(name: string): boolean; get(name: string): FormDataEntryValue | null };
const val = (form: FormLike, name: string): string | null => String(form.get(name) || "").trim() || null;

// A NEW property: the typed client name and address, or, when a saved client of this company is chosen, that client's (and the link to it)
export async function clientFieldsForCreate(form: FormLike, db: ClientDb, companyId: string): Promise<{ ok: true; landlordName: string | null; landlordAddress: string | null; clientContactId: string | null } | { ok: false; error: string }> {
  const chosen = String(form.get("clientContactId") || "").trim();
  if (!chosen) return { ok: true, landlordName: val(form, "landlordName"), landlordAddress: val(form, "landlordAddress"), clientContactId: null };
  const client = await findClient(db, companyId, chosen);
  if (!client) return { ok: false, error: "That saved client was not found" };
  return { ok: true, landlordName: client.name, landlordAddress: client.address ?? null, clientContactId: String(client.id) };
}

// An EDIT: only what the form actually sent is written. A form that sent no client fields changes none of them.
export type ClientUpdateData = { landlordName?: string | null; landlordAddress?: string | null; clientContactId?: string | null };
export async function clientFieldsForUpdate(form: FormLike, db: ClientDb, companyId: string): Promise<{ ok: true; data: ClientUpdateData } | { ok: false; error: string }> {
  const data: ClientUpdateData = {};
  if (form.has("landlordName")) data.landlordName = val(form, "landlordName");
  if (form.has("landlordAddress")) data.landlordAddress = val(form, "landlordAddress");
  if (form.has("clientContactId")) {
    const chosen = String(form.get("clientContactId") || "").trim();
    if (!chosen) data.clientContactId = null;
    else {
      const client = await findClient(db, companyId, chosen);
      if (!client) return { ok: false, error: "That saved client was not found" };
      data.clientContactId = String(client.id);
      data.landlordName = client.name;
      data.landlordAddress = client.address ?? null;
    }
  }
  return { ok: true, data };
}
