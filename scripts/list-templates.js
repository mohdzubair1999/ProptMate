// Run with: node --env-file=.env scripts/list-templates.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.template.findMany({ orderBy: { name: "asc" } });
  if (templates.length === 0) {
    console.log("No templates found at all.");
    return;
  }
  templates.forEach((t) => console.log(`"${t.name}"  (propertyType: ${t.propertyType || "none"}, id: ${t.id})`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
