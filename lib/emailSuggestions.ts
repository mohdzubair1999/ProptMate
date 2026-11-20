import { filterOptions, type PickerOption } from "./searchSelect";
import { isValidEmail } from "./clientContacts";

// Suggesting an email address after a few letters, like a mail program: from the company's saved clients, its portal clients, its team and the addresses reports
// have been sent to before. Pure, so every rule is tested; the database steps take the database as a parameter.

export type Source = "client" | "portal" | "team" | "recent";
export type Suggestion = { email: string; name: string | null; source: Source };
type Person = { name?: string | null; email?: string | null };
const LABEL: Record<Source, string> = { client: "Saved client", portal: "Portal client", team: "Team", recent: "Used before" };
export const sourceLabel = (s: Source): string => LABEL[s];

export const normaliseEmail = (s: unknown): string => (typeof s === "string" ? s.trim().toLowerCase() : "");
const cleanName = (s: unknown): string | null => { const t = typeof s === "string" ? s.replace(/\s+/g, " ").trim() : ""; return t ? t.slice(0, 120) : null; };

// One list, no address twice. Addresses used before come first (the most recent first), then clients, portal clients and team; a name is taken from wherever it is known.
export function buildSuggestions(sources: { recent?: Person[]; clients?: Person[]; portal?: Person[]; team?: Person[] }, cap = 800): Suggestion[] {
  const order: [Source, Person[] | undefined][] = [["recent", sources?.recent], ["client", sources?.clients], ["portal", sources?.portal], ["team", sources?.team]];
  const rank: Source[] = ["client", "portal", "team", "recent"]; // which label is shown when one address is in several places
  const byEmail = new Map<string, Suggestion>();
  for (const [source, list] of order) {
    for (const p of Array.isArray(list) ? list : []) {
      const email = normaliseEmail(p?.email);
      if (!isValidEmail(email)) continue;
      const name = cleanName(p?.name);
      const have = byEmail.get(email);
      if (!have) { byEmail.set(email, { email, name, source }); continue; }
      if (!have.name && name) have.name = name;
      if (rank.indexOf(source) < rank.indexOf(have.source)) have.source = source;
    }
  }
  return [...byEmail.values()].slice(0, Math.max(1, cap));
}

// The best matches for what has been typed (words in any order, in the address or the name), never an address already chosen, never an exact repeat of what is typed
export function suggestFor(list: Suggestion[], query: unknown, opts: { exclude?: string[]; limit?: number } = {}): Suggestion[] {
  const q = typeof query === "string" ? query.trim() : "";
  if (!q) return [];
  const skip = new Set((opts.exclude ?? []).map(normaliseEmail));
  const typed = normaliseEmail(q);
  const pool = (Array.isArray(list) ? list : []).filter((s) => s && !skip.has(s.email) && s.email !== typed);
  const options: PickerOption[] = pool.map((s) => ({ value: s.email, label: s.email, hint: [s.name ?? "", sourceLabel(s.source)].filter(Boolean).join(" · "), keywords: [s.name ?? ""] }));
  const byEmail = new Map(pool.map((s) => [s.email, s]));
  const limit = Number.isInteger(opts.limit) && (opts.limit as number) > 0 ? Math.min(opts.limit as number, 20) : 6;
  return filterOptions(options, q, limit).shown.map((o) => byEmail.get(o.value)!).filter(Boolean);
}

// the addresses worth remembering from a list that was just sent to: valid, lower case, no repeats, a sensible number
export function recipientsToRemember(emails: unknown): string[] {
  const out: string[] = [];
  for (const e of Array.isArray(emails) ? emails : []) { const n = normaliseEmail(e); if (isValidEmail(n) && !out.includes(n)) out.push(n); if (out.length >= 20) break; }
  return out;
}

type Row = Record<string, any>;
export interface SuggestDb {
  clientContact: { findMany(a: any): Promise<Row[]> };
  propertyAccess: { findMany(a: any): Promise<Row[]> };
  user: { findMany(a: any): Promise<Row[]> };
  sentRecipient: { findMany(a: any): Promise<Row[]>; upsert(a: any): Promise<Row>; deleteMany(a: any): Promise<{ count: number }> };
}
const need = (companyId: unknown): string => { if (typeof companyId !== "string" || !companyId) throw new Error("No company"); return companyId; };

export async function loadSuggestions(db: SuggestDb, companyId: string | null | undefined): Promise<Suggestion[]> {
  const company = need(companyId);
  const [clients, access, team, recent] = await Promise.all([
    db.clientContact.findMany({ where: { companyId: company, email: { not: null } }, select: { name: true, email: true }, orderBy: { name: "asc" }, take: 500 }),
    db.propertyAccess.findMany({ where: { property: { companyId: company } }, select: { user: { select: { name: true, email: true } } }, take: 500 }),
    db.user.findMany({ where: { companyId: company }, select: { name: true, email: true }, take: 300 }),
    db.sentRecipient.findMany({ where: { companyId: company }, select: { email: true, name: true }, orderBy: { lastUsedAt: "desc" }, take: 300 }),
  ]);
  return buildSuggestions({ recent, clients, portal: access.map((a) => a.user), team });
}

// Remember the addresses a report was sent to (each time again counts, so the ones used most and last come first). Never fails the send: one bad address is skipped.
export async function rememberRecipients(db: Pick<SuggestDb, "sentRecipient">, companyId: string | null | undefined, emails: unknown, names: Record<string, string> = {}, now: Date = new Date()): Promise<number> {
  const company = need(companyId);
  let n = 0;
  for (const email of recipientsToRemember(emails)) {
    const name = cleanName(names[email]);
    try {
      await db.sentRecipient.upsert({ where: { companyId_email: { companyId: company, email } }, create: { companyId: company, email, name, useCount: 1, lastUsedAt: now }, update: { useCount: { increment: 1 }, lastUsedAt: now, ...(name ? { name } : {}) } });
      n++;
    } catch { /* one address that cannot be saved must never stop the others, or the send */ }
  }
  return n;
}

export async function forgetRecipient(db: Pick<SuggestDb, "sentRecipient">, companyId: string | null | undefined, id: string): Promise<boolean> {
  const r = await db.sentRecipient.deleteMany({ where: { id, companyId: need(companyId) } });
  return r.count > 0;
}
