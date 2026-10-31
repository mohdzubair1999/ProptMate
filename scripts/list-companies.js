// Run with: node --env-file=.env scripts/list-companies.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany();
  if (companies.length === 0) {
    console.log("No companies found — sign up in the app first.");
    return;
  }
  companies.forEach((c) => console.log(`${c.id}  —  ${c.name}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
