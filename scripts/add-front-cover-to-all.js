// Adds a "Front cover" section (with a single photo field) to every template for a company
// that doesn't already have one — skips any template that's already been given one, so it's
// safe to run more than once.
// Run with: node --env-file=.env scripts/add-front-cover-to-all.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/add-front-cover-to-all.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const templates = await prisma.template.findMany({
    where: { companyId },
    include: { sections: { select: { id: true, title: true, order: true } } },
  });

  let added = 0;
  let skipped = 0;

  for (const template of templates) {
    const alreadyHasCover = template.sections.some((s) => s.title.toLowerCase().includes("front cover"));

    if (alreadyHasCover) {
      console.log(`⏭  ${template.name} — already has a Front cover section, skipped`);
      skipped++;
      continue;
    }

    // Shift every existing section down by one, then insert Front cover at position 0
    await prisma.templateSection.updateMany({
      where: { templateId: template.id },
      data: { order: { increment: 1 } },
    });

    const section = await prisma.templateSection.create({
      data: { templateId: template.id, title: "Front cover", order: 0 },
    });

    await prisma.templateField.create({
      data: { sectionId: section.id, label: "Front cover photo of property", type: "PHOTO", order: 0 },
    });

    console.log(`✓  ${template.name} — Front cover section added`);
    added++;
  }

  console.log(`\nDone. ${added} template(s) updated, ${skipped} already had one.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
