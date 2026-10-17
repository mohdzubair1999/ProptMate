// One-off fix: restores the test compliance document's expiry date back to its real value
// after testing the compliance alert cron job.
require("dotenv").config();
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const doc = await prisma.complianceDocument.findFirst({
    where: { type: "OTHER", property: { address: { contains: "78GF Bedford Road" } } },
  });

  if (!doc) {
    console.log("Couldn't find that document — nothing changed.");
    return;
  }

  await prisma.complianceDocument.update({
    where: { id: doc.id },
    data: { expiryDate: new Date("2026-08-10") },
  });

  console.log(`✓ Restored expiry date to 10/08/2026 for document ${doc.id}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
