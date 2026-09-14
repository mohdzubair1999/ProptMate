// STEP 2 of 3 in the auth migration — run this AFTER `npx prisma db push` has applied the
// new schema. Reads the backup created by 1-export-existing-passwords.js and creates a
// proper Better Auth "credential" Account record for each user, so they can log in with
// their existing password exactly as before — no forced reset.
//
// Run with: node --env-file=.env scripts/2-import-existing-passwords.js

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const { randomUUID } = require("crypto");
const prisma = new PrismaClient();

async function main() {
  if (!fs.existsSync("existing-passwords-backup.json")) {
    console.error("existing-passwords-backup.json not found — run scripts/1-export-existing-passwords.js first.");
    process.exit(1);
  }

  const users = JSON.parse(fs.readFileSync("existing-passwords-backup.json", "utf8"));
  let created = 0;
  let skipped = 0;

  for (const u of users) {
    // Don't create a duplicate if this has already been run once
    const existing = await prisma.account.findFirst({ where: { userId: u.id, providerId: "credential" } });
    if (existing) {
      console.log(`⏭  ${u.email} — already has a credential account, skipped`);
      skipped++;
      continue;
    }

    await prisma.account.create({
      data: {
        id: randomUUID(),
        userId: u.id,
        providerId: "credential",
        accountId: u.id, // Better Auth convention: accountId = userId for credential accounts
        password: u.password, // same bcrypt hash as before — verified via our custom bcrypt hook in lib/auth.ts
      },
    });

    console.log(`✓  ${u.email} — password restored`);
    created++;
  }

  console.log(`\nDone. ${created} account(s) created, ${skipped} already existed.`);
  console.log("Existing users can now log in with their same email and password as before.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
