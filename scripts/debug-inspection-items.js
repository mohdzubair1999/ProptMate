// Diagnostic — dumps the raw InspectionItem records for a given inspection, so we can see
// exactly what's stored (itemName, templateFieldId, etc) rather than guessing why a
// comparison isn't matching correctly.
// Run with: node --env-file=.env scripts/debug-inspection-items.js INSPECTION_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const inspectionId = process.argv[2];
  if (!inspectionId) {
    console.error("Usage: node --env-file=.env scripts/debug-inspection-items.js INSPECTION_ID");
    process.exit(1);
  }

  const inspection = await prisma.inspection.findUnique({
    where: { id: inspectionId },
    select: { id: true, type: true, templateId: true, comparedToInspectionId: true },
  });
  console.log("Inspection:", JSON.stringify(inspection, null, 2));

  const items = await prisma.inspectionItem.findMany({
    where: { inspectionId },
    select: { id: true, room: true, itemName: true, condition: true, templateFieldId: true },
  });
  console.log(`\n${items.length} item(s) on this inspection:`);
  for (const item of items) {
    console.log(JSON.stringify(item));
  }

  if (inspection?.comparedToInspectionId) {
    const compareItems = await prisma.inspectionItem.findMany({
      where: { inspectionId: inspection.comparedToInspectionId },
      select: { id: true, room: true, itemName: true, condition: true, templateFieldId: true },
    });
    console.log(`\n${compareItems.length} item(s) on the comparison inspection (${inspection.comparedToInspectionId}):`);
    for (const item of compareItems) {
      console.log(JSON.stringify(item));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
