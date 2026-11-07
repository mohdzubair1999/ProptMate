import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 300) : JSON.stringify(x).slice(0, 400))); };
// A guard over EVERY API route, read as source (it does not need a database or a running site). Every route is either protected by the signed-in session, or is on the
// short list below with the proof it relies on. A new route that is on neither list fails here, so nobody can add an open route by accident.
const root = "app/api";
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : f === "route.ts" ? [p] : []; });
const routes = walk(root).map((p) => ({ name: relative(root, p).replace(/\/route\.ts$/, ""), src: readFileSync(p, "utf8") }));
const PUBLIC: Record<string, { why: string; needs: string[] }> = {
  "auth/[...all]": { why: "sign-in and sign-up, handled by the auth library", needs: [] },
  health: { why: "an uptime check that returns no data", needs: [] },
  "chat/website": { why: "the public website chat: blocked IPs refused and rate limited", needs: ["isIpBlocked", "checkRateLimit"] },
  "cron/compliance-alerts": { why: "the scheduled reminders: only with the secret", needs: ["CRON_SECRET", "Bearer"] },
  "integrations/webhook/[integrationId]": { why: "a customer's webhook: blocked IPs refused and the request is checked", needs: ["isIpBlocked", "signature"] },
  "upload-qr-report": { why: "a tenant's photo from the property's QR code: blocked IPs refused and the file checked", needs: ["isIpBlocked", "signature"] },
  "plan/[token]/pdf": { why: "a shared plan's PDF: the link must be well formed, active and not expired, and downloads are rate limited", needs: ["SHARE_TOKEN_RE", "checkRateLimit", "loadSharedPlan"] },
  "webhooks/stripe": { why: "Stripe's webhook: the signature is verified", needs: ["constructEvent("] },
};
ok(`${routes.length} API routes were found (a sanity check that the guard is reading them)`, routes.length >= 28, routes.length);
const protectedRoutes = routes.filter((r) => /getSession\s*\(/.test(r.src));
ok("every route is either protected by the session or is on the explicit public list: none is open by accident", routes.filter((r) => !protectedRoutes.includes(r) && !(r.name in PUBLIC)).map((r) => r.name).length === 0, routes.filter((r) => !protectedRoutes.includes(r) && !(r.name in PUBLIC)).map((r) => r.name));
ok("every entry on the public list is a real route that still exists (no stale entries hiding a removed route)", Object.keys(PUBLIC).every((n) => routes.some((r) => r.name === n)), Object.keys(PUBLIC).filter((n) => !routes.some((r) => r.name === n)));
ok("a route on the public list does not also pretend to use the session (the list is honest)", Object.keys(PUBLIC).every((n) => !protectedRoutes.some((r) => r.name === n)), Object.keys(PUBLIC).filter((n) => protectedRoutes.some((r) => r.name === n)));
for (const [name, p] of Object.entries(PUBLIC)) { const r = routes.find((x) => x.name === name); if (!r) continue; ok(`public route '${name}' still carries its protection (${p.why})`, p.needs.every((s) => r.src.includes(s)), p.needs.filter((s) => !r.src.includes(s))); }
ok("there are 23 session-protected routes at the moment (a change here means a route was added or removed: check it is meant)", protectedRoutes.length === 23, protectedRoutes.length);
// ---- each protected route ----
const TOUCHES: [string, RegExp][] = [["the database", /\bprisma\./], ["an outside service (fetch)", /\bfetch\(/], ["an AI service", /\baiFetch\(/], ["file storage (put)", /\bput\(/], ["file storage (del)", /\bdel\(/], ["the email service", /new Resend|\bresend\.|Resend\(/], ["PDF rendering", /renderToBuffer\(/], ["image processing", /\bsharp\(/], ["reading an uploaded form", /\.formData\(\)/], ["reading an uploaded file", /\.arrayBuffer\(\)/]];
for (const r of protectedRoutes) {
  const handlers = [...r.src.matchAll(/export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)];
  ok(`'${r.name}' has at least one handler`, handlers.length >= 1);
  handlers.forEach((h, i) => {
    const body = r.src.slice(h.index!, i + 1 < handlers.length ? handlers[i + 1].index! : undefined); const at = body.search(/getSession\s*\(/);
    ok(`'${r.name}' ${h[1]} asks who is signed in`, at >= 0);
    if (at < 0) return;
    ok(`'${r.name}' ${h[1]} refuses an anonymous request straight away with a 401 (right after asking)`, /!\s*session/.test(body.slice(at, at + 260)) && /401/.test(body.slice(at, at + 400)), body.slice(at, at + 260));
    const early = TOUCHES.filter(([, re]) => { const m = body.search(re); return m >= 0 && m < at; }).map(([label]) => label);
    ok(`'${r.name}' ${h[1]} touches nothing (${TOUCHES.map(([l]) => l).slice(0, 3).join(", ")} ...) BEFORE it knows who is asking`, early.length === 0, early);
  });
  ok(`'${r.name}' never takes the company from the request: it comes from the signed-in user`, !/body\??\.companyId|searchParams\.get\(\s*["']companyId["']\s*\)|params\??\.companyId|formData\.get\(\s*["']companyId["']\s*\)/.test(r.src));
  ok(`'${r.name}' does not turn off its own authentication (no edge runtime shortcut, no commented-out session check)`, !/\/\/\s*if\s*\(!session/.test(r.src) && !/\/\*\s*if\s*\(!session/.test(r.src));
}
console.log(`\nEvery API route is protected or explicitly public: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
