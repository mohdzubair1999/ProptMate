// One-off fix: renames existing "Inventory: ... (unfurnished)" templates, removing the
// furnishing status suffix now that it's captured per-inspection (Summary Reference
// section) instead of being baked into the template name.
// Run with: node --env-file=.env scripts/rename-unfurnished-templates.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const templates = await prisma.template.findMany({
    where: { name: { contains: "unfurnished" } },
  });

  if (templates.length === 0) {
    console.log("No templates with '(unfurnished)' found — nothing to rename.");
    return;
  }

  for (const t of templates) {
    const newName = t.name.replace(" (unfurnished)", "").replace(" (HMO, unfurnished)", " (HMO)");
    await prisma.template.update({ where: { id: t.id }, data: { name: newName } });
    console.log(`✓ Renamed "${t.name}" → "${newName}"`);
  }

  console.log(`\nDone — renamed ${templates.length} template(s).`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
