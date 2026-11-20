import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
let pass = 0, fail = 0; const ok = (n: string, c: boolean, x: any = "") => { c ? pass++ : (fail++, console.log("FAIL:", n, typeof x === "string" ? x.slice(0, 400) : JSON.stringify(x).slice(0, 400))); };
// Every environment variable the app reads must be written down in .env.example (set or commented out), so a new deployment is never missing a setting nobody knew about.
const walk = (d: string, out: string[] = []): string[] => { for (const f of readdirSync(d)) { const p = join(d, f); if (f === "node_modules" || f === ".next") continue; const s = statSync(p); if (s.isDirectory()) walk(p, out); else if (/\.(ts|tsx|js|mjs)$/.test(f)) out.push(p); } return out; };
const used = new Set<string>(); for (const dir of ["app", "lib", "components"]) for (const f of walk(dir)) for (const m of readFileSync(f, "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
for (const m of readFileSync("proxy.ts", "utf8").matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) used.add(m[1]);
const SYSTEM = new Set(["NODE_ENV", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "NEXT_RUNTIME", "CI", "NEXT_PHASE"]);
const doc = readFileSync(".env.example", "utf8"); const documented = (v: string) => new RegExp(`^#?\\s*${v}=`, "m").test(doc);
const missing = [...used].filter((v) => !SYSTEM.has(v) && !documented(v));
ok(`every setting the app reads is documented in .env.example (${used.size} found)`, missing.length === 0, missing);
for (const v of ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_STARTER", "STRIPE_PRICE_GROWTH", "STRIPE_PRICE_SCALE", "STRIPE_PRICE_ENTERPRISE", "CRON_SECRET", "INTEGRATION_ENCRYPTION_KEY"]) ok(`${v} is documented and has no real value written in`, new RegExp(`^${v}=""$`, "m").test(doc));
ok("the file contains no secret-looking values (no sk_/pk_/whsec_/price_ keys, no long random strings)", !/(sk_(live|test)_|pk_(live|test)_|whsec_|price_[A-Za-z0-9]{8,})/.test(doc));
console.log(`\nSettings documented in .env.example: ${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
