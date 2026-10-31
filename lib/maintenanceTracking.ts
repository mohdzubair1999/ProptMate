// Rules for tracked maintenance jobs: what a job may contain, what counts as already tracked, and how they are ordered. Pure (no
// database), so every rule is tested directly.

export const JOB_STATUSES = ["open", "in_progress", "done"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_URGENCIES = ["urgent", "28-days", "routine", "monitor"] as const;
export type JobUrgency = (typeof JOB_URGENCIES)[number];
export type JobInput = { urgency: JobUrgency; timeframe: string; area: string; text: string };
export type JobView = { id: string; urgency: string; timeframe: string; area: string; text: string; status: string; createdAt: string; resolvedAt: string | null; resolvedInspectionId: string | null; lastSeenInspectionId: string | null; lastSeenAt: string | null };

export const MAX_JOBS_PER_SAVE = 40;
const LIMITS = { timeframe: 60, area: 120, text: 600 } as const;

export const isJobStatus = (v: unknown): v is JobStatus => typeof v === "string" && (JOB_STATUSES as readonly string[]).includes(v);
const isUrgency = (v: unknown): v is JobUrgency => typeof v === "string" && (JOB_URGENCIES as readonly string[]).includes(v);

// text from the screen: control characters removed and whitespace collapsed; anything longer than the limit is refused (never cut short:
// a job that reads differently from what was recorded would be misleading)
function field(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 0 && t.length <= max ? t : null;
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
export const jobKey = (area: string, text: string) => `${norm(area)}|${norm(text)}`;

// the jobs sent from the browser: anything that is not a well-formed job is dropped, duplicates within the batch are dropped, and no
// more than 40 are taken
export function cleanJobInputs(raw: unknown): JobInput[] {
  if (!Array.isArray(raw)) return [];
  const out: JobInput[] = [], seen = new Set<string>();
  for (const j of raw) {
    if (!j || typeof j !== "object") continue;
    const o = j as Record<string, unknown>;
    const area = field(o.area, LIMITS.area), text = field(o.text, LIMITS.text), timeframe = field(o.timeframe, LIMITS.timeframe);
    if (!area || !text || !timeframe || !isUrgency(o.urgency)) continue;
    const k = jobKey(area, text);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ urgency: o.urgency, timeframe, area, text });
    if (out.length >= MAX_JOBS_PER_SAVE) break;
  }
  return out;
}

// a job already open or in progress on the property (same area and wording) is not tracked a second time
export function splitNew(existing: { area: string; text: string }[], jobs: JobInput[]): { fresh: JobInput[]; skipped: number } {
  const have = new Set((Array.isArray(existing) ? existing : []).map((e) => jobKey(String(e?.area ?? ""), String(e?.text ?? ""))));
  const fresh = jobs.filter((j) => !have.has(jobKey(j.area, j.text)));
  return { fresh, skipped: jobs.length - fresh.length };
}

const URGENCY_ORDER: Record<string, number> = { urgent: 0, "28-days": 1, routine: 2, monitor: 3 };
// open and in-progress jobs first (most urgent first, then oldest first); finished jobs after them, the most recently finished first
export function sortJobs<T extends { status: string; urgency: string; createdAt: string; resolvedAt?: string | null }>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    const ad = a.status === "done" ? 1 : 0, bd = b.status === "done" ? 1 : 0;
    if (ad !== bd) return ad - bd;
    if (ad === 1) return String(b.resolvedAt ?? "").localeCompare(String(a.resolvedAt ?? "")) || a.createdAt.localeCompare(b.createdAt);
    return (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9) || a.createdAt.localeCompare(b.createdAt);
  });
}
export const countOpen = (jobs: { status: string }[]) => jobs.filter((j) => j.status !== "done").length;
