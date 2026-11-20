// Creates the "Snagging Report" template.
// Run with: node --env-file=.env scripts/seed-snagging-report-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const sections = [
  {
    title: "General",
    fields: [
      {
        label: "Property type",
        type: "DROPDOWN",
        options: [
          "Studio",
          "Apartment",
          "Bungalow",
          "Terraced house",
          "Semi-detached house",
          "Detached house",
          "Housing block",
          "Commercial office block",
          "Warehouse",
          "Retail space",
          "Sports facility",
          "Restaurant / cafe",
          "Public house / recreational centre",
          "Medical building",
        ],
      },
      { label: "Weather at time of inspection", type: "DROPDOWN", options: ["Dry", "Rain / wet", "Windy", "Snow / ice"] },
    ],
  },
  {
    title: "Snagging issues",
    fields: [
      { label: "The following snagging issues have been logged", type: "GRID_SECTION", options: "Snagging report grid" },
      { label: "Additional inspector comments", type: "TEXT" },
      { label: "Additional snagging photos", type: "PHOTO" },
      { label: "Additional contractor comments", type: "TEXT" },
      { label: "Additional contractor completion works photos", type: "PHOTO" },
    ],
  },
  {
    title: "Declarations",
    fields: [
      {
        label: "Terms and conditions",
        type: "TERMS",
        options: "This snagging report reflects defects identified at the time of inspection and confirms sign-off once remedial works are completed.",
      },
      { label: "Inspector", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
      { label: "Contractor", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-snagging-report-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: {
      companyId,
      name: "Snagging Report",
      inspectionType: "mid-term",
      propertyType: null,
    },
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
          options: field.options
            ? Array.isArray(field.options)
              ? JSON.stringify(field.options)
              : field.options
            : null,
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
