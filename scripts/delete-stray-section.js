// Run with: node --env-file=.env scripts/delete-stray-section.js
// Preview first with: node --env-file=.env scripts/delete-stray-section.js --dry-run
//
// Deletes the confirmed-empty stray "Downstairs W.C" (no period) section on the 4-bed house
// template — an abandoned, unfinished manual edit found by fix-house-templates.js's
// near-duplicate check. investigate-section.js already confirmed nothing real is attached to
// it, but this re-checks that itself before deleting anything, rather than trusting a
// possibly-stale earlier result.
//
// Once this runs, re-run fix-house-templates.js to have it create a proper, fully-structured
// "Downstairs W.C." in the correct position for this template.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const template = await prisma.template.findFirst({
    where: { name: "Inventory: 4-bed house (unfurnished)" },
  });
  if (!template) {
    console.log('No template found named "Inventory: 4-bed house (unfurnished)".');
    return;
  }

  const section = await prisma.templateSection.findFirst({
    where: { templateId: template.id, title: "Downstairs W.C" },
    include: { fields: true },
  });
  if (!section) {
    console.log('No section titled exactly "Downstairs W.C" (no period) found — already resolved, nothing to do.');
    return;
  }

  // Fresh safety re-check, not trusting an earlier investigation result that may be stale.
  const totalAnswers = await prisma.fieldAnswer.count({ where: { field: { sectionId: section.id } } });
  const totalItems = await prisma.inspectionItem.count({ where: { templateField: { sectionId: section.id } } });
  if (totalAnswers > 0 || totalItems > 0) {
    console.error(
      `Refusing to delete "${section.title}" — found ${totalAnswers} field answer(s) and ${totalItems} inventory item(s) actually attached to it. This needs a manual look, not an automatic delete.`
    );
    return;
  }

  console.log(`"${section.title}" (id: ${section.id}) has ${section.fields.length} field(s) and no real data attached — safe to delete.`);

  if (DRY_RUN) {
    console.log("[dry run] Would delete this section and its field(s). Nothing has been changed.");
    return;
  }

  await prisma.$transaction([
    prisma.templateField.deleteMany({ where: { sectionId: section.id } }),
    prisma.templateSection.delete({ where: { id: section.id } }),
  ]);

  console.log(`Deleted "${section.title}" and its ${section.fields.length} field(s). You can now re-run fix-house-templates.js for this template.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
