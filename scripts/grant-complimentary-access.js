// Marks a company as having complimentary access — no Stripe subscription needed, and it
// will never be blocked by the billing gate (which only blocks on an explicitly cancelled
// subscription). Useful for your own company, demos, or comped accounts.
// Run with: node --env-file=.env scripts/grant-complimentary-access.js "Company Name or company ID"

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    console.error('Usage: node --env-file=.env scripts/grant-complimentary-access.js "Company Name or ID"');
    process.exit(1);
  }

  const company = await prisma.company.findFirst({
    where: { OR: [{ id: identifier }, { name: { equals: identifier, mode: "insensitive" } }] },
  });

  if (!company) {
    console.log(`No company found matching "${identifier}".`);
    const all = await prisma.company.findMany({ select: { id: true, name: true } });
    console.log("\nYour companies:");
    all.forEach((c) => console.log(`  ${c.name} (${c.id})`));
    return;
  }

  await prisma.company.update({
    where: { id: company.id },
    data: { subscriptionStatus: "complimentary", planTier: "complimentary" },
  });

  console.log(`✓ "${company.name}" now has complimentary access — no Stripe subscription needed, never blocked.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
