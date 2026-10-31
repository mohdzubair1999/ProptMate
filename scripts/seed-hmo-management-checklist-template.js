// Creates the "Checklist: Management of Houses in Multiple Occupation" template.
// Run with: node --env-file=.env scripts/seed-hmo-management-checklist-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO_NA = ["Yes", "No", "N/A"];

function followUpBlock() {
  return [
    { label: "If 'No' to any of the above, please provide details", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const sections = [
  {
    title: "General information",
    fields: [
      { label: "Is the HMO licence on display?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Have manager contact details been provided and displayed prominently?", type: "DROPDOWN", options: YES_NO_NA },
    ],
  },
  {
    title: "Fire safety",
    fields: [
      { label: "Are escape routes unobstructed?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Is firefighting equipment working correctly?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "How often is fire equipment tested?", type: "DROPDOWN", options: ["Annually", "Every 6 months", "Every 3 months", "Monthly"] },
      { label: "Who tests this fire equipment?", type: "SHORT_TEXT" },
      { label: "Is a record kept of the tests?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire alarm serviced and sound-tested to BS 5839-1:2002 within the last 6 months?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire alarm servicing certificate available?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Emergency lighting tested to BS 5266-1:1999?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "When was emergency lighting last tested?", type: "DROPDOWN", options: ["Within 12 months", "Within 6 months", "Within 3 months", "Within the last month"] },
      { label: "Emergency lighting servicing certificate available?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Tenants received fire instructions?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Instructions displayed?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
  {
    title: "Property structure",
    fields: [
      { label: "What to check", type: "INFO_TEXT", options: "Stair carpets, handrails, accessible roofs, balconies, and low-sill windows." },
      { label: "Internal structure, fixtures and equipment in good repair throughout?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Low-level window sills adequately protected?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
  {
    title: "Damp and mould",
    fields: [
      { label: "Any signs of damp or mould observed?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Severity", type: "DROPDOWN", options: ["No concern", "Monitor — recheck at next visit", "Address within 28 days", "Urgent — address within 7 days"] },
      { label: "Location(s) and extent", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Water supply",
    fields: [
      { label: "Drainage system maintained and working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Drainage pipes, chambers and gullies free from blockages or leaks?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water supply, tanks and cisterns maintained?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water tank covered?", type: "DROPDOWN", options: YES_NO_NA },
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
  {
    title: "Common areas",
    fields: [
      { label: "Common areas in good repair and decoration?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Common facilities and equipment safe and working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Stairs fitted with securely fixed banisters and handrails?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Stair coverings securely fixed and in good repair?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Windows and extract ventilation in good repair?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Adequate working light fittings?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
  {
    title: "Property exterior",
    fields: [
      { label: "Outbuildings, yards and forecourts in good repair and clean?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Garden safe and tidy?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Boundary fences, walls and railings in good, safe repair?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Sufficient bin capacity before collection?", type: "DROPDOWN", options: YES_NO_NA },
      ...followUpBlock(),
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-hmo-management-checklist-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Checklist: Management of Houses in Multiple Occupation", inspectionType: "hmo", propertyType: "hmo" },
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
