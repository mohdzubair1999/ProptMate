// STEP 1 of 3 in the auth migration — run this BEFORE pushing the new Prisma schema.
// The new schema removes the `password` column from User (Better Auth stores passwords
// in a separate Account table instead). If you push the new schema first, every existing
// password is permanently lost with no way to recover them. This script reads them out
// via raw SQL first, while the old column still exists, and saves them to a local file.
//
// Run with: node --env-file=.env scripts/1-export-existing-passwords.js

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const prisma = new PrismaClient();

async function main() {
  // Raw SQL, not the generated Prisma Client API — bypasses the TypeScript types (which
  // already reflect the new schema without `password`) and reads whatever's actually still
  // in the real database column right now.
  const users = await prisma.$queryRawUnsafe(
    `SELECT id, email, password FROM "User" WHERE password IS NOT NULL`
  );

  fs.writeFileSync("existing-passwords-backup.json", JSON.stringify(users, null, 2));

  console.log(`✅ Backed up ${users.length} existing password(s) to existing-passwords-backup.json`);
  console.log("\nNext: run `npx prisma db push` to apply the new schema, then run");
  console.log("scripts/2-import-existing-passwords.js to restore them into Better Auth's format.");
}

main()
  .catch((e) => {
    console.error("Backup failed — do NOT proceed to db push until this succeeds:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
