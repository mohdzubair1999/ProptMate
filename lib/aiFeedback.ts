// "The AI missed something": what an inspector can report about a photo analysis, cleaned before it is stored. Pure, so it is tested without a database.
export const MISS_KINDS = ["small_mark", "item", "detail", "cleanliness", "other"] as const;
export type MissKind = (typeof MISS_KINDS)[number];
export const MISS_KIND_LABELS: Record<MissKind, string> = { small_mark: "A small mark or damage", item: "An item or fitting", detail: "A detail (reading, label, quantity)", cleanliness: "Dirt, mould or damp", other: "Something else" };
export const MISS_NOTE_MIN = 5;
export const MISS_NOTE_MAX = 1000;

export function cleanMissNote(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (t.length < MISS_NOTE_MIN) return null;
  return t.length > MISS_NOTE_MAX ? t.slice(0, MISS_NOTE_MAX).trimEnd() : t;
}
export function pickMissKind(v: unknown): MissKind { return (MISS_KINDS as readonly string[]).includes(v as string) ? (v as MissKind) : "other"; }
export function pickMissMode(v: unknown): "quick" | "detailed" { return v === "detailed" ? "detailed" : "quick"; }
export const MISS_HOURLY_LIMIT = 20; // reports one person can send in an hour

// How often the AI is reported as missing something: reports against photo analyses in the same period. Pure.
export function missSummary(reports: { kind: string }[], analyses: number): { reports: number; analyses: number; per100: number | null; byKind: Record<MissKind, number> } {
  const byKind = Object.fromEntries(MISS_KINDS.map((k) => [k, 0])) as Record<MissKind, number>;
  for (const r of reports) byKind[pickMissKind(r?.kind)]++;
  const a = Number.isFinite(analyses) && analyses > 0 ? Math.floor(analyses) : 0;
  return { reports: reports.length, analyses: a, per100: a > 0 ? Math.round((reports.length / a) * 1000) / 10 : null, byKind };
}
