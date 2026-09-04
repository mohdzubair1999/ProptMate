// Adds "Comments" (TEXT) and "Photos" (PHOTO) fields to every template section that has an
// Inventory item list but doesn't already have them — fixes existing Inventory templates
// seeded before this feature existed, without needing to touch any of them by hand.
// Safe to run more than once — skips any section that already has a Comments field.
// Run with: node --env-file=.env scripts/add-comments-photos-to-inventory-rooms.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/add-comments-photos-to-inventory-rooms.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const templates = await prisma.template.findMany({
    where: { companyId },
    include: { sections: { include: { fields: true } } },
  });

  let sectionsFixed = 0;
  let sectionsSkipped = 0;

  for (const template of templates) {
    for (const section of template.sections) {
      const hasInventoryList = section.fields.some((f) => f.type === "INVENTORY_SECTION");
      if (!hasInventoryList) continue; // not a room-with-items section, leave it alone

      const alreadyHasComments = section.fields.some((f) => f.label.toLowerCase() === "comments");
      if (alreadyHasComments) {
        sectionsSkipped++;
        continue;
      }

      const maxOrder = Math.max(...section.fields.map((f) => f.order), -1);

      await prisma.templateField.create({
        data: { sectionId: section.id, label: "Comments", type: "TEXT", order: maxOrder + 1 },
      });
      await prisma.templateField.create({
        data: { sectionId: section.id, label: "Photos", type: "PHOTO", order: maxOrder + 2 },
      });

      console.log(`✓  ${template.name} — "${section.title}" — Comments & Photos added`);
      sectionsFixed++;
    }
  }

  console.log(`\nDone. ${sectionsFixed} section(s) fixed, ${sectionsSkipped} already had it.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
