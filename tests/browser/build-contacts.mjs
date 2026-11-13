// Builds the client details screens and the email suggestions for the browser test page (tests/browser/contacts.js). Run from the project folder: node tests/browser/build-contacts.mjs
import { createRequire } from "module"; import { fileURLToPath } from "url"; import path from "path"; import { execFileSync } from "child_process";
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.join(here, "..", ".."); const require = createRequire(path.join(root, "package.json")); const esb = require("esbuild");
const stub = path.join(here, "stub_contacts_actions.js");
execFileSync(path.join(root, "node_modules", ".bin", "tailwindcss"), ["-i", "app/globals.css", "-o", "tests/browser/app.css"], { cwd: root, stdio: "ignore" });
esb.build({ entryPoints: [path.join(here, "entry-contacts.js")], bundle: true, outfile: path.join(here, "contacts.js"), jsx: "automatic", logLevel: "error", nodePaths: [path.join(root, "node_modules")], define: { "process.env.NODE_ENV": "\"development\"" },
  alias: { "next/navigation": path.join(here, "stub_nav.js"), "next/link": path.join(here, "stub_link.js"), "@/lib/actions/acknowledgements": stub, "@/lib/actions/inspections": stub, "@/lib/actions/clientContacts": stub, "@/lib/offlineQueue": stub } }).then(() => console.log("Contacts test page built"), (e) => { console.log("ERR", String(e.message).slice(0, 700)); process.exit(1); });
