// Creates the "HMO checklist" (simple) template.
// Run with: node --env-file=.env scripts/seed-hmo-checklist-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];

const sections = [
  {
    title: "HMO checklist",
    fields: [
      { label: "Is the HMO licence on display?", type: "DROPDOWN", options: YES_NO },
      { label: "Have manager contact details been provided and displayed prominently?", type: "DROPDOWN", options: YES_NO },
      { label: "Are escape routes unobstructed?", type: "DROPDOWN", options: YES_NO },
      { label: "Is firefighting equipment working correctly?", type: "DROPDOWN", options: YES_NO },
      { label: "How often is fire equipment tested?", type: "DROPDOWN", options: ["Annually", "Every 6 months", "Every 3 months", "Monthly", "Every 2 weeks", "Daily"] },
      { label: "Who tests this fire equipment?", type: "TEXT" },
      { label: "Is a record kept of the tests? If yes, where stored?", type: "TEXT" },
      { label: "Fire alarm serviced and sound-tested to BS 5839-1:2002 within the last 6 months?", type: "DROPDOWN", options: YES_NO },
      { label: "Fire alarm servicing certificate available?", type: "DROPDOWN", options: YES_NO },
      { label: "If yes, where can this be accessed?", type: "TEXT" },
      { label: "Emergency lighting tested to BS 5266-1:1999?", type: "DROPDOWN", options: YES_NO },
      { label: "Emergency lighting servicing certificate available?", type: "DROPDOWN", options: YES_NO },
      { label: "If yes, where can this be accessed?", type: "TEXT" },
      { label: "Tenants received fire instructions?", type: "DROPDOWN", options: YES_NO },
      { label: "Instructions displayed?", type: "DROPDOWN", options: YES_NO },
      { label: "Low-level window sill adequately protected (e.g. bars)?", type: "DROPDOWN", options: YES_NO },
      { label: "Window restrictors fitted?", type: "DROPDOWN", options: YES_NO },
      { label: "Fire door closers fitted and attached?", type: "DROPDOWN", options: YES_NO },
      { label: "Stairs fitted with securely fixed banisters and handrails?", type: "DROPDOWN", options: YES_NO },
      { label: "Sufficient bin capacity before collection?", type: "DROPDOWN", options: YES_NO },
      { label: "General comments (if required)", type: "TEXT" },
      { label: "General photos (if required)", type: "PHOTO" },
    ],
  },
  {
    title: "Terms and conditions",
    fields: [{ label: "Please note", type: "TERMS", options: "This checklist reflects the property's condition against HMO management standards at the time of inspection." }],
  },
  {
    title: "Signatures",
    fields: [
      { label: "Tenant signature", type: "SIGNATURE" },
      { label: "Inspector signature", type: "SIGNATURE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-hmo-checklist-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "HMO checklist", inspectionType: "hmo", propertyType: "hmo" },
  });

  for (let s = 0; s < sections.length; s++) {
    const section = sections[s];
    const createdSection = await prisma.templateSection.create({
      data: { templateId: template.id, title: section.title, order: s },
    });

    for (let f = 0; f < section.fields.length; f++) {
      const field = section.fields[f];
      await prisma.templateField.create({
        data: {
          sectionId: createdSection.id,
          label: field.label,
          type: field.type,
          options: field.options ? (Array.isArray(field.options) ? JSON.stringify(field.options) : field.options) : null,
          order: f,
        },
      });
    }
    console.log(`Created section "${section.title}" with ${section.fields.length} fields`);
  }

  console.log(`\nDone. Template id: ${template.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
