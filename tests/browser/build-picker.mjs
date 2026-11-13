// Builds the searchable picker and the forms that use it for the browser test page (tests/browser/picker.js). Run from the project folder: node tests/browser/build-picker.mjs
import { createRequire } from "module"; import { fileURLToPath } from "url"; import path from "path"; import { execFileSync } from "child_process";
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.join(here, "..", ".."); const require = createRequire(path.join(root, "package.json")); const esb = require("esbuild");
const stub = path.join(here, "stub_forms_actions.js");
// the app's real stylesheet (Tailwind), so sizes such as the 16 px phone text and the 44 px rows are tested as they really are
execFileSync(path.join(root, "node_modules", ".bin", "tailwindcss"), ["-i", "app/globals.css", "-o", "tests/browser/app.css"], { cwd: root, stdio: "ignore" });
esb.build({ entryPoints: [path.join(here, "entry-picker.js")], bundle: true, outfile: path.join(here, "picker.js"), jsx: "automatic", logLevel: "error", nodePaths: [path.join(root, "node_modules")], define: { "process.env.NODE_ENV": "\"development\"" },
  alias: { "next/navigation": path.join(here, "stub_nav.js"), "@/lib/actions/inspections": stub, "@/lib/actions/portal": stub, "@/lib/actions/compliance": stub } }).then(() => console.log("Picker test page built"), (e) => { console.log("ERR", String(e.message).slice(0, 600)); process.exit(1); });
