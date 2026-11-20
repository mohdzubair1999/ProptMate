// Runs before every build (npm "prebuild") and FAILS it if the "no company means no filter" trap is written anywhere.
//
// The trap: Prisma silently ignores a filter whose value is `undefined`, so `{ companyId: user.companyId || undefined }`
// becomes "no filter at all" for an account that isn't linked to a company - and that account then matches EVERY
// company's records. Write the filter with scopeCompanyId() from lib/access.ts instead, which gives such an account a
// value that matches nothing.
const fs = require("fs");
const path = require("path");

const ROOTS = ["app", "lib", "components"];
const PATTERN = /ompanyId\s*(?:\)|\bas\s+string\s*\))?\s*(?:\|\||\?\?)\s*undefined\b/;
const bad = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(entry.name) && !full.endsWith(path.join("lib", "access.ts"))) {
      fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
        if (PATTERN.test(line) && !/^\s*(\/\/|\*)/.test(line)) bad.push(`${path.relative(process.cwd(), full)}:${i + 1}: ${line.trim().slice(0, 110)}`);
      });
    }
  }
}

const base = process.argv[2] || process.cwd();
process.chdir(base);
for (const r of ROOTS) if (fs.existsSync(r)) walk(r);

if (bad.length > 0) {
  console.error("\nBUILD STOPPED - an account with no company would match EVERY company here:\n");
  for (const b of bad) console.error("  " + b);
  console.error("\nUse scopeCompanyId(...) from \"@/lib/access\" instead of `|| undefined`.\n");
  process.exit(1);
}
console.log("company scoping check passed: no unscoped company filters.");
