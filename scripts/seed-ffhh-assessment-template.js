// Creates the "Fitness for Human Habitation (FFHH) assessment" template.
// Run with: node --env-file=.env scripts/seed-ffhh-assessment-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO_NA = ["Yes", "No", "N/A"];

function followUpBlock() {
  return [
    { label: "If 'No', please provide details", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const sections = [
  {
    title: "About this report",
    fields: [
      {
        label: "FFHH information",
        type: "TEXT",
        options:
          "The Homes (Fitness for Human Habitation) Act 2018 requires landlords to ensure rented properties are fit for habitation. This report documents the property against key criteria: neglect, instability, damp, unsafe layout, light/ventilation, water supply, drainage, and food preparation facilities.",
      },
    ],
  },
  { title: "Repair", fields: [{ label: "Interior in good repair, not neglected?", type: "DROPDOWN", options: YES_NO_NA }, ...followUpBlock()] },
  { title: "Stability", fields: [{ label: "Building stable and of solid construction?", type: "DROPDOWN", options: YES_NO_NA }, ...followUpBlock()] },
  { title: "Freedom from damp", fields: [{ label: "Free from visible damp and mould?", type: "DROPDOWN", options: YES_NO_NA }, ...followUpBlock()] },
  { title: "Natural lighting", fields: [{ label: "Windows give adequate natural light?", type: "DROPDOWN", options: YES_NO_NA }, ...followUpBlock()] },
  { title: "Internal arrangement", fields: [{ label: "Property has a safe layout?", type: "DROPDOWN", options: YES_NO_NA }, ...followUpBlock()] },
  { title: "Ventilation", fields: [{ label: "Suitable ventilation present?", type: "DROPDOWN", options: YES_NO_NA }, ...followUpBlock()] },
  {
    title: "Water supply",
    fields: [
      { label: "Working supplies of hot and cold water?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water supply, tanks and cisterns well maintained?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water tank covered?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
  {
    title: "Drainage and sanitary conveniences",
    fields: [
      { label: "Drainage system maintained and working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Drainage pipes, chambers and gullies free from blockages or leaks?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
  {
    title: "Storing, preparing and cooking food",
    fields: [
      { label: "Food storage provision adequate and in good repair?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Cooking and food preparation provision adequate?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
  {
    title: "Smoke and carbon monoxide alarms",
    fields: [
      { label: "Smoke alarm(s) present?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Location of smoke alarm(s)", type: "TEXT" },
      { label: "Smoke alarm(s) tested and working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "If 'No', please provide details", type: "TEXT" },
      { label: "CO alarm(s) present?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Location of CO alarm(s)", type: "TEXT" },
      { label: "CO alarm(s) tested and working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "If 'No', please provide details", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Property exterior",
    fields: [
      { label: "Exterior in good repair, not neglected?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Outbuildings, yards, forecourts in good repair?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Garden safe and tidy?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Boundary fences, walls, railings in good repair?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Sufficient bin capacity before collection?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
  {
    title: "Gas and electric",
    fields: [
      { label: "Gas appliances inspected within the last 12 months?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Gas safety certificate supplied to tenants?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Electrical installation report within the last 5 years?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Portable appliances tested?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-ffhh-assessment-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Fitness for Human Habitation (FFHH) assessment", inspectionType: "mid-term", propertyType: null },
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
