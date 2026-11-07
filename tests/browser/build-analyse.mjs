// Builds the Analyse button for the browser test page (tests/browser/analyse.js). Run from the project folder: node tests/browser/build-analyse.mjs
import { createRequire } from "module"; import { fileURLToPath } from "url"; import path from "path";
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.join(here, "..", ".."); const require = createRequire(path.join(root, "package.json")); const esb = require("esbuild");
esb.build({ entryPoints: [path.join(here, "entry-analyse.js")], bundle: true, outfile: path.join(here, "analyse.js"), jsx: "automatic", logLevel: "error", nodePaths: [path.join(root, "node_modules")], define: { "process.env.NODE_ENV": "\"development\"" },
  alias: { "next/navigation": path.join(here, "stub_nav.js"), "@/lib/actions/inspections": path.join(here, "stub_inspections.js") } }).then(() => console.log("Analyse test page built"), (e) => { console.log("ERR", String(e.message).slice(0, 500)); process.exit(1); });
