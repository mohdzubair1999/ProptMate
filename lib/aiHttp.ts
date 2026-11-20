// One careful way to call an AI service, shared by every route that does: it tries again (at most twice more) when the
// service is briefly overloaded or unreachable, never when the request itself is wrong, and never past the time the page
// can wait. Pulled out so the behaviour is identical everywhere and is tested once.

export type PostResult = { ok: true; data: any; attempts: number } | { ok: false; status: number; error: string };
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);

export async function postJsonWithRetry(o: {
  url: string;
  headers: Record<string, string>;
  // Builds the request body. Called with true when the service has refused a temperature setting, so it can leave it out.
  body: (withoutTemperature: boolean) => unknown;
  temperatureFallback?: boolean;
  label: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  budgetMs?: number;
}): Promise<PostResult> {
  const f = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const start = now();
  const budget = o.budgetMs ?? 50_000; // the route may run for 60 seconds in all, and photos are downloaded first
  let attempts = 0;
  let withoutTemperature = false;
  let last: { error: string; status: number } = { error: "AI analysis failed", status: 502 };

  while (attempts < 3) {
    const remaining = budget - (now() - start);
    if (attempts > 0 && remaining < 6000) break;
    attempts++;
    const controller = new AbortController();
    // The first attempt may use all the time there is (a slow, thorough analysis of many photos can legitimately take
    // most of a minute); only a RETRY is held to 40 seconds, since it has less time left anyway.
    const timer = setTimeout(() => controller.abort(), Math.max(5000, attempts === 1 ? remaining - 1000 : Math.min(40_000, remaining - 1000)));
    try {
      const res = await f(o.url, { method: "POST", signal: controller.signal, headers: o.headers, body: JSON.stringify(o.body(withoutTemperature)) });
      if (res.ok) {
        try {
          return { ok: true, data: await res.json(), attempts };
        } catch {
          return { ok: false, status: 502, error: "AI analysis failed" };
        }
      }
      const body = await res.text().catch(() => "");
      // Some models refuse a temperature setting. That is not a failure of the request itself: ask again without it.
      if (res.status === 400 && !withoutTemperature && o.temperatureFallback && /temperature/i.test(body)) {
        withoutTemperature = true;
        attempts--;
        continue;
      }
      console.error(`${o.label} error:`, res.status, body.slice(0, 500));
      last = { error: "AI analysis failed", status: 502 };
      if (!RETRY_STATUS.has(res.status)) return { ok: false, ...last };
      const ra = parseFloat(res.headers.get("retry-after") || "");
      await sleep(Number.isFinite(ra) ? Math.min(8000, ra * 1000) : 600 * attempts * attempts);
    } catch (err) {
      if ((err as any)?.name === "AbortError") return { ok: false, error: "The AI took too long to answer - please try again", status: 504 };
      console.error(`${o.label} call failed:`, err);
      last = { error: "AI analysis failed", status: 502 };
      await sleep(600 * attempts * attempts);
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, ...last };
}

// ---- a drop-in for fetch() that retries brief AI trouble ----------------------------------------------------------------
// For routes that make their own AI call and read the reply their own way. It behaves like fetch and returns the RESPONSE ITSELF,
// untouched, in every normal case. The differences:
//   - a reply of "overloaded" or "try again" (408, 429, 5xx, 529) or a dropped connection is tried again, at most twice more,
//     but only while there is time left (budgetMs), and never for a request that is itself wrong (400, 401, 404, 413 ...);
//   - it never shortens the FIRST attempt: a slow answer (a long report being read) is waited for exactly as before, unless the
//     caller sets firstAttemptTimeoutMs;
//   - when it finally gives up on a dropped connection or a timeout, it returns an ordinary error Response (502 or 504) instead
//     of throwing, so the route's existing "if the reply is not ok" handling deals with it.
export type AiFetchOptions = {
  label?: string;
  budgetMs?: number; // no retry is started with less than 6 seconds of this left
  firstAttemptTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

const errorResponse = (status: number, message: string) => new Response(JSON.stringify({ error: { type: "ai_request_failed", message } }), { status, headers: { "content-type": "application/json" } });

export async function aiFetch(url: string, init: RequestInit = {}, o: AiFetchOptions = {}): Promise<Response> {
  const f = o.fetchImpl ?? fetch;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const start = now();
  const budget = o.budgetMs ?? 40_000;
  const label = o.label ?? "AI request";
  const callerSignal = init.signal ?? undefined;
  let attempts = 0;

  while (attempts < 3) {
    attempts++;
    const controller = new AbortController();
    const remaining = budget - (now() - start);
    const timeoutMs = attempts === 1 ? o.firstAttemptTimeoutMs : Math.min(40_000, Math.max(5000, remaining - 1000));
    const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null;
    const onCallerAbort = () => controller.abort();
    if (callerSignal) {
      if (callerSignal.aborted) controller.abort();
      else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
    try {
      const res = await f(url, { ...init, signal: controller.signal });
      if (res.ok || !RETRY_STATUS.has(res.status) || attempts >= 3 || budget - (now() - start) < 6000) return res;
      // worth another go: say so in the log, free this reply, wait a moment
      console.error(`${label} error (trying again):`, res.status, (await res.text().catch(() => "")).slice(0, 300));
      const ra = parseFloat(res.headers.get("retry-after") || "");
      await sleep(Number.isFinite(ra) ? Math.min(8000, ra * 1000) : 600 * attempts * attempts);
    } catch (err) {
      if (callerSignal?.aborted) throw err; // the caller cancelled it themselves: that is theirs to handle
      if ((err as any)?.name === "AbortError") return errorResponse(504, "The AI took too long to answer - please try again");
      console.error(`${label} call failed:`, err);
      if (attempts >= 3 || budget - (now() - start) < 6000) return errorResponse(502, "AI request failed");
      await sleep(600 * attempts * attempts);
    } finally {
      if (timer) clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }
  }
  return errorResponse(502, "AI request failed");
}
