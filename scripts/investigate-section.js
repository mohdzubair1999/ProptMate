// Run with: node --env-file=.env scripts/investigate-section.js
//
// Purely read-only — makes no changes to anything. Shows exactly what's inside the stray
// "Downstairs W.C" section in the 4-bed house template (found by fix-house-templates.js's
// near-duplicate check), including whether any real inspection data is actually attached to
// its fields, so you can decide whether it's safe to rename or delete before touching it.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

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
    console.log('No section titled exactly "Downstairs W.C" (no period) found on this template — may already be resolved.');
    return;
  }

  console.log(`Section: "${section.title}"  (id: ${section.id}, order: ${section.order}, hidden: ${section.hidden})`);
  console.log(`Has ${section.fields.length} field(s):\n`);

  for (const field of section.fields) {
    console.log(`  Field: "${field.label}"  (type: ${field.type}, id: ${field.id})`);

    // Any answers recorded against this field, across every inspection that's ever used it.
    const answerCount = await prisma.fieldAnswer.count({ where: { fieldId: field.id } });
    console.log(`    Field answers recorded: ${answerCount}`);

    // Only INVENTORY_SECTION fields can have inspection items (a room's item list) attached.
    if (field.type === "INVENTORY_SECTION") {
      const itemCount = await prisma.inspectionItem.count({ where: { templateFieldId: field.id } });
      console.log(`    Inventory items recorded against this field: ${itemCount}`);
    }
    console.log("");
  }

  const totalAnswers = await prisma.fieldAnswer.count({ where: { field: { sectionId: section.id } } });
  const totalItems = await prisma.inspectionItem.count({ where: { templateField: { sectionId: section.id } } });
  console.log(`Total across the whole section: ${totalAnswers} field answer(s), ${totalItems} inventory item(s).`);
  console.log(totalAnswers === 0 && totalItems === 0 ? "\nNothing real is attached to this section — looks safe to delete or rename." : "\nSome real data is attached — worth reviewing before deleting this section.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
