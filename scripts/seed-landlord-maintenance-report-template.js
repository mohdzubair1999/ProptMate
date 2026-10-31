// Creates the "Landlord maintenance report" template.
// Run with: node --env-file=.env scripts/seed-landlord-maintenance-report-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const sections = [
  {
    title: "About this report",
    fields: [
      {
        label: "Disclaimer",
        type: "TERMS",
        options: "This report identifies maintenance items observed during inspection, categorised by urgency, to help keep the property in good, rentable condition.",
      },
    ],
  },
  {
    title: "Attention required — urgent",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "The following urgent attention is recommended to keep the property in good, rentable condition." },
      { label: "Urgent attention is recommended for the following items", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Attention required — advisory",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "The following attention is advised, but not urgent." },
      { label: "Advisory attention is recommended for the following items", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-landlord-maintenance-report-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Landlord maintenance report", inspectionType: "maintenance", propertyType: null },
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
