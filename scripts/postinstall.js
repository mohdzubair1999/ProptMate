// Runs prisma generate always (needed for the Prisma client's types regardless of
// environment), and prisma db push only when actually building on Vercel - detected via
// Vercel's own VERCEL=1 environment variable, automatically set during its build process.
// Running db push locally would fail outright, since the local .env only has a placeholder
// DATABASE_URL, not a real database connection - this would break `npm ci`/`npm run build`
// entirely as a pre-push sanity check, which is the opposite of what this is meant to help with.
const { execSync } = require("child_process");

execSync("prisma generate", { stdio: "inherit" });

if (process.env.VERCEL) {
  console.log("Running on Vercel - applying any pending schema changes with prisma db push...");
  execSync("prisma db push --skip-generate", { stdio: "inherit" });
  // Then keep the templates in step with the product's defaults (no page breaks, clean template names,
  // Part furnished) - automatically, every deploy. Best-effort: it can never fail the build.
  try {
    execSync("node scripts/migrate-templates.js", { stdio: "inherit" });
  } catch (err) {
    console.warn("Template cleanup could not run - the deploy continues without it:", err.message);
  }
} else {
  console.log("Not running on Vercel - skipping prisma db push (local DATABASE_URL is a placeholder, not a real database).");
}
