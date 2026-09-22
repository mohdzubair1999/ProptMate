// Run with: node --env-file=.env scripts/backfill-account-issuer.js
//
// Fixes existing sign-ins after adding the `issuer` column to Account. better-auth's own
// internal sign-in lookup requires providerId === "credential" AND issuer === "local:credential"
// (confirmed directly from the library's source: createLocalAccountIssuer("credential")).
// Existing accounts, created before this column existed, have issuer = null and would
// otherwise be unable to sign in even with the correct password.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.account.updateMany({
    where: { providerId: "credential", issuer: null },
    data: { issuer: "local:credential" },
  });
  console.log(`Updated ${result.count} credential account(s) with the correct issuer value.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
