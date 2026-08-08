// Generates the JWT that Apple requires as a "client secret" for Sign in with Apple.
// Unlike Google/LinkedIn, Apple doesn't hand you a static secret — you sign this token
// yourself using the private key (.p8 file) from your Apple Developer account.
//
// Run with: node scripts/generate-apple-secret.js
// It'll prompt for your Team ID, Client ID (Services ID), Key ID, and the path to your .p8 file,
// then print the generated secret to paste into your .env as APPLE_SECRET.
//
// Valid for ~150 days — Apple's absolute maximum is 6 months (180 days). Set a reminder to
// regenerate and update it before then, or sign-in with Apple will silently stop working.

const readline = require("readline");
const fs = require("fs");
const { SignJWT, importPKCS8 } = require("jose");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

async function main() {
  console.log("Generate Apple Sign In client secret\n");

  const teamId = await ask("Apple Team ID (top-right of the Apple Developer dashboard): ");
  const clientId = await ask("Services ID (your Client ID, e.g. com.proptmate.web): ");
  const keyId = await ask("Key ID (shown when you created the Sign In with Apple key): ");
  const keyPath = await ask("Path to your downloaded .p8 private key file: ");

  rl.close();

  const privateKeyPem = fs.readFileSync(keyPath.trim(), "utf8");
  const privateKey = await importPKCS8(privateKeyPem, "ES256");

  const secret = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId.trim() })
    .setIssuer(teamId.trim())
    .setIssuedAt()
    .setExpirationTime("150d")
    .setAudience("https://appleid.apple.com")
    .setSubject(clientId.trim())
    .sign(privateKey);

  console.log("\n✅ Generated. Add these to your .env:\n");
  console.log(`APPLE_CLIENT_ID="${clientId.trim()}"`);
  console.log(`APPLE_SECRET="${secret}"`);
  console.log("\nThis secret expires in ~150 days — regenerate it before then.");
}

main().catch((err) => {
  console.error("Failed to generate secret:", err.message);
  process.exit(1);
});
