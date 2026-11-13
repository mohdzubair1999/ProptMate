// Creates the "Legionella risk assessment — 12-month review" template.
// Run with: node --env-file=.env scripts/seed-legionella-12month-review-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO_NA = ["Yes", "No", "N/A"];

const sections = [
  {
    title: "General",
    fields: [
      { label: "About this review", type: "INFO_TEXT", options: "To be completed at least once per year." },
      { label: "Date of original risk assessment", type: "SHORT_TEXT" },
      { label: "Has the water system, or how it's used, changed since the original assessment?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Has the use of the building changed?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Is new information available about risks or controls?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Does hot water flow from any outlet below 50°C?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Does cold water flow from any outlet above 20°C?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Are current tenants or visitors more susceptible due to age, health or lifestyle?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Has there been a case of Legionnaires' disease associated with this system?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Assessor signature", type: "SIGNATURE" },
      { label: "Please note", type: "INFO_TEXT", options: "If you answered 'Yes' to any question above, a new risk assessment should be carried out by a competent person." },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-legionella-12month-review-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Legionella risk assessment — 12-month review", inspectionType: "legionella", propertyType: null },
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
