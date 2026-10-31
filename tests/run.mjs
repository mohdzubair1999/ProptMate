// Runs every test in this folder, one after another, and says plainly whether they all passed.
//
//   npm test
//
// These are the self-contained tests: they use only the project's own code, no database and no network. Each prints a line like
// "... 45 passed, 0 failed". Exit code is 0 only if every one passes, so this can also be run before pushing.
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".test.mts")).sort();
let failed = 0, totalPassed = 0;
for (const f of files) {
  const r = spawnSync("npx", ["--yes", "tsx@4.23.15", join(dir, f)], { encoding: "utf8", cwd: join(dir, ".."), env: { ...process.env, NODE_NO_WARNINGS: "1" } });
  const out = (r.stdout || "") + (r.stderr || "");
  const line = out.split("\n").reverse().find((l) => /\d+ passed, \d+ failed/.test(l));
  const m = line && line.match(/(\d+) passed, (\d+) failed/);
  const ok = r.status === 0 && m && m[2] === "0";
  if (m) totalPassed += parseInt(m[1], 10);
  console.log(`${ok ? "PASS" : "FAIL"}  ${f.padEnd(34)} ${m ? `${m[1]} passed, ${m[2]} failed` : "did not finish"}`);
  if (!ok) { failed++; console.log(out.split("\n").filter((l) => /FAIL|Error/.test(l)).slice(0, 8).join("\n")); }
}
console.log(failed === 0 ? `\nAll ${files.length} test files passed (${totalPassed} checks).` : `\n${failed} of ${files.length} test files FAILED.`);
process.exit(failed === 0 ? 0 : 1);
