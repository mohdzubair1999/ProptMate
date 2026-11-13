// Running a big set of photos through the AI analysis in batches. A large set is split into several requests. The server allows only so many requests in a window
// of time (for example 40 Detailed requests in 15 minutes), so the requests must NOT all be sent at once: they go a few at a time, and as soon as the server says
// "slow down" no more are sent. Everything already analysed is kept, the photos still to do are remembered, and the next run sends only those.
// Pure (no screen, no network of its own): the caller supplies the function that makes one request, so every rule here is tested directly.

// A failed request's `status` is the HTTP status, 0 for "no answer at all", or -1 for "cancelled" (the person stopped it or left the page): a cancelled batch is not a failure, it is just not done.
export type BatchResult<T> = { ok: true; data: T } | { ok: false; status: number; message?: string; retryAfterSeconds?: number };
export type RunOutcome<T> = {
  done: Map<number, T>; // every batch analysed so far, including ones from an earlier run
  failed: number[]; // batches that were tried and went wrong this run (the service had a problem)
  notStarted: number[]; // batches not analysed because a limit was reached (or sending was stopped): they were not lost, just not done yet
  limit: { message: string; retryAfterSeconds: number } | null; // the server said "slow down": what it said, and how long to wait
  serviceTrouble: boolean; // several requests in a row failed, so sending stopped rather than keep trying
  cancelled: boolean; // the person pressed Stop (or left the page): nothing more was sent, and what was in flight was dropped
};

export const DEFAULT_CONCURRENCY = 3;
// how many batches are in flight at once on the screen: Detailed (one structured call per batch) can run more at once than it could when each batch was two calls
export const DETAILED_CONCURRENCY = 5;
export const QUICK_CONCURRENCY = 4;
export const QUICK_BATCH_SIZE = 12; // Quick used to send 40 photos in one request, which made the AI skip things; smaller batches get each photo its share of attention
export const DETAILED_BATCH_SIZE = 4;
export const MAX_CONSECUTIVE_FAILURES = 3;

// "Retry-After" is a number of seconds; anything else (missing, junk, negative, huge) becomes a sensible wait of between 1 second and an hour
export function parseRetryAfter(header: unknown): number {
  const n = typeof header === "string" ? Number(header.trim()) : typeof header === "number" ? header : NaN;
  if (!Number.isFinite(n) || n <= 0) return 60;
  return Math.min(3600, Math.max(1, Math.ceil(n)));
}

export async function runBatches<T>(opts: {
  total: number;
  run: (index: number) => Promise<BatchResult<T>>;
  concurrency?: number;
  done?: Map<number, T>; // batches already analysed in an earlier run: they are not sent again
  onProgress?: (doneCount: number, total: number) => void;
  signal?: AbortSignal; // when it is aborted, nothing more is started
}): Promise<RunOutcome<T>> {
  const total = Number.isInteger(opts.total) && opts.total > 0 ? Math.min(opts.total, 10000) : 0;
  const done = new Map<number, T>();
  if (opts.done) for (const [i, v] of opts.done) if (Number.isInteger(i) && i >= 0 && i < total) done.set(i, v);
  const pending: number[] = [];
  for (let i = 0; i < total; i++) if (!done.has(i)) pending.push(i);
  const failed: number[] = [], limited: number[] = [];
  let limit: RunOutcome<T>["limit"] = null, stopped = false, serviceTrouble = false, consecutiveFailures = 0, next = 0;
  const workers = Math.max(1, Math.min(Math.floor(opts.concurrency ?? DEFAULT_CONCURRENCY) || 1, pending.length || 1));

  const worker = async () => {
    while (!stopped && !opts.signal?.aborted && next < pending.length) {
      const index = pending[next++];
      let result: BatchResult<T>;
      try { result = await opts.run(index); } catch { result = { ok: false, status: 0 }; }
      if (result && result.ok) { done.set(index, result.data); consecutiveFailures = 0; opts.onProgress?.(done.size, total); continue; }
      const r = (result ?? { ok: false, status: 0 }) as Extract<BatchResult<T>, { ok: false }>;
      if (r.status === -1 || opts.signal?.aborted) { limited.push(index); stopped = true; continue; } // cancelled: not done, but not a failure either
      if (r.status === 429) {
        // The server said "slow down". Nothing more is sent; this batch and every one not yet sent are simply not done yet.
        if (!limit) limit = { message: typeof r.message === "string" ? r.message : "", retryAfterSeconds: parseRetryAfter(r.retryAfterSeconds) };
        limited.push(index); stopped = true;
        continue;
      }
      failed.push(index);
      if (++consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) { stopped = true; serviceTrouble = true; } // the service looks down: do not send fifty more to fail
    }
  };
  await Promise.all(Array.from({ length: workers }, worker));
  const notStarted = [...limited, ...pending.slice(next)].filter((i) => !done.has(i) && !failed.includes(i)).sort((a, b) => a - b);
  return { done, failed: failed.sort((a, b) => a - b), notStarted: [...new Set(notStarted)], limit, serviceTrouble, cancelled: !!opts.signal?.aborted };
}

// Batch numbers (0-based) as the photo numbers a person counts: "photos 161-384", "photos 1-4, 9-12", "photo 7"
export function photoRanges(batchIndexes: number[], batchSize: number, photoCount: number): string {
  const size = Math.max(1, Math.floor(batchSize) || 1), total = Math.max(0, Math.floor(photoCount) || 0);
  const spans: [number, number][] = [];
  for (const i of [...new Set(batchIndexes)].filter((x) => Number.isInteger(x) && x >= 0).sort((a, b) => a - b)) {
    const from = i * size + 1, to = Math.min((i + 1) * size, total);
    if (from > total) continue;
    const last = spans[spans.length - 1];
    if (last && from === last[1] + 1) last[1] = to; else spans.push([from, to]);
  }
  if (spans.length === 0) return "no photos";
  const text = spans.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(", ");
  return spans.length === 1 && spans[0][0] === spans[0][1] ? `photo ${text}` : `photos ${text}`;
}
export function photoCountOf(batchIndexes: number[], batchSize: number, photoCount: number): number {
  const size = Math.max(1, Math.floor(batchSize) || 1), total = Math.max(0, Math.floor(photoCount) || 0);
  return [...new Set(batchIndexes)].filter((x) => Number.isInteger(x) && x >= 0).reduce((n, i) => n + Math.max(0, Math.min((i + 1) * size, total) - i * size), 0);
}

export function waitText(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(1, Math.ceil(seconds)) : 60;
  if (s < 45) return "less than a minute";
  const m = Math.round(s / 60);
  if (m < 60) return m <= 1 ? "about a minute" : `about ${m} minutes`;
  const h = Math.round(m / 60);
  return h <= 1 ? "about an hour" : `about ${h} hours`;
}

// ---- carrying on by itself ----
// The server's limit is a fixed window (for example 15 minutes), so once it has passed the whole allowance is back. When a limit stops a run, the screen waits for
// exactly that long (with a visible countdown) and carries on with only the missing photos. It does NOT wait for the company's DAILY limit (that is hours away),
// for a wait of more than 20 minutes, or after 8 rounds in a row (about two hours), so it can never keep going unattended for ever.
export const MAX_AUTO_ROUNDS = 8;
export const MAX_AUTO_WAIT_SECONDS = 20 * 60;
export const isDailyLimit = (message: string): boolean => /today's allowance/i.test(String(message ?? ""));
export function autoContinueSeconds(limit: { message: string; retryAfterSeconds: number } | null, roundsSoFar: number): number | null {
  if (!limit || !Number.isFinite(roundsSoFar) || roundsSoFar >= MAX_AUTO_ROUNDS) return null;
  if (isDailyLimit(limit.message)) return null;
  if (!Number.isFinite(limit.retryAfterSeconds) || limit.retryAfterSeconds > MAX_AUTO_WAIT_SECONDS) return null;
  return Math.max(1, Math.ceil(limit.retryAfterSeconds)) + 3; // a few seconds over, so the window has really ended
}
// "9:42" for the countdown
export function countdownText(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// What to tell the person, in plain words. Shown beside the button, not typed into their notes.
export function batchNotices(o: { failed: number[]; notStarted: number[]; limit: RunOutcome<unknown>["limit"]; serviceTrouble: boolean; batchSize: number; photoCount: number; willContinue?: boolean; cancelled?: boolean }): string[] {
  const out: string[] = [];
  const missing = (idx: number[]) => photoRanges(idx, o.batchSize, o.photoCount);
  if (o.notStarted.length > 0) {
    const n = photoCountOf(o.notStarted, o.batchSize, o.photoCount);
    if (o.cancelled) {
      out.push(`⚠ Stopped: ${missing(o.notStarted)} (${n}) ${n === 1 ? "was" : "were"} not analysed. Press the button to analyse just ${n === 1 ? "that photo" : "those photos"}; what is done has been kept.`);
    } else if (o.limit) {
      const daily = isDailyLimit(o.limit.message);
      out.push(daily
        ? `⚠ Stopped at your company's daily limit: ${missing(o.notStarted)} (${n}) ${n === 1 ? "has" : "have"} not been analysed yet. ${o.limit.message} What is done has been kept.`
        : o.willContinue
        ? `⚠ Stopped at the limit for AI requests: ${missing(o.notStarted)} (${n}) ${n === 1 ? "has" : "have"} not been analysed yet. It will carry on by itself in ${waitText(o.limit.retryAfterSeconds)} if you keep this page open (or press the button to carry on now): only ${n === 1 ? "that photo" : "those photos"} will be sent, and what is done has been kept.`
        : `⚠ Stopped at the limit for AI requests: ${missing(o.notStarted)} (${n}) ${n === 1 ? "has" : "have"} not been analysed yet. Try again in ${waitText(o.limit.retryAfterSeconds)}: only ${n === 1 ? "that photo" : "those photos"} will be sent, and what is done has been kept.`);
    } else {
      out.push(`⚠ ${missing(o.notStarted)} (${n}) ${n === 1 ? "was" : "were"} not sent. Try again and only ${n === 1 ? "that photo" : "those photos"} will be sent; what is done has been kept.`);
    }
  }
  if (o.failed.length > 0) {
    const n = photoCountOf(o.failed, o.batchSize, o.photoCount);
    out.push(`⚠ ${missing(o.failed)} (${n}) could not be analysed because the analysis service had a problem${o.serviceTrouble ? " (it stopped responding, so sending was stopped)" : ""}. Try again to fill in just ${n === 1 ? "that photo" : "those"}.`);
  }
  return out;
}
