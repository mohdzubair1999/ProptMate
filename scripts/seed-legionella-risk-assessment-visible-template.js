// Creates the "Legionella risk assessment (reference notes visible)" template.
// Notes here are editable/pre-filled, not just static display text.
// Run with: node --env-file=.env scripts/seed-legionella-risk-assessment-visible-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO_NA = ["Yes", "No", "N/A"];

function editableNote(label, text) {
  return { label, type: "TEXT", options: text };
}

const sections = [
  {
    title: "Overview",
    fields: [
      { label: "Describe property type", type: "SHORT_TEXT" },
      { label: "Any occupant particularly susceptible to Legionella (age, health, lifestyle)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Describe the cold water system", type: "TEXT" },
      { label: "Describe the hot water system", type: "TEXT" },
    ],
  },
  {
    title: "Water outlet temperature",
    fields: [
      editableNote("Background", "Cold water should flow below 20°C and hot water above 50°C at outlets to minimise risk."),
      { label: "Cold water below 20°C at outlets?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Hot water above 50°C at outlets?", type: "DROPDOWN", options: YES_NO_NA },
      editableNote("Note defects and actions", "Identify any defect or risk and recommendations below. Identify a responsible person if action is required."),
      { label: "Defects, risks and actions", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Cold water storage tanks",
    fields: [
      { label: "Is there a cold water storage tank?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Location of tank", type: "SHORT_TEXT" },
      editableNote("Background", "Tanks should have a tight lid, stay below 20°C, and be insulated."),
      { label: "Tight-fitting lid?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water clean and free from debris?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water below 20°C?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Tank insulated?", type: "DROPDOWN", options: YES_NO_NA },
      editableNote("Note defects and actions", "Identify any defect or risk and recommendations below. Identify a responsible person if action is required."),
      { label: "Defects, risks and actions", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Hot water",
    fields: [
      { label: "Heated to and stored at 60°C?", type: "DROPDOWN", options: YES_NO_NA },
      editableNote("Background", "Temperatures above 60°C risk scalding; maintain the boiler/tank setting at 60°C."),
      editableNote("Defects and actions", "Identify any defect or risk and recommendations below."),
      { label: "Defects, risks and actions", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Little-used outlets",
    fields: [
      { label: "Outlets used less than once weekly?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "If yes, identify outlet and location", type: "TEXT" },
      editableNote("Background", "Little-used outlets should be flushed weekly for at least 2 minutes."),
      editableNote("Defects and actions", "Identify any risk and recommendations below."),
      { label: "Defects, risks and actions", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Shower heads",
    fields: [
      { label: "Showers present?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "If yes, identify location", type: "TEXT" },
      editableNote("Background", "Shower heads should be cleaned, disinfected and descaled every 6 months."),
      editableNote("Defects and actions", "Identify any risk and recommendations below."),
      { label: "Defects, risks and actions", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Dead legs and redundant pipework",
    fields: [
      { label: "Dead legs present?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "If yes, identify location", type: "TEXT" },
      editableNote("Background", "Redundant pipework with little through-flow can allow water to stagnate."),
      editableNote("Defects and actions", "Identify any risk and recommendations below."),
      { label: "Defects, risks and actions", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Unoccupied periods",
    fields: [
      { label: "Property left unoccupied for periods of time?", type: "DROPDOWN", options: YES_NO_NA },
      editableNote("Background", "Outlets should be flushed weekly during unoccupied periods, and thoroughly on re-occupation."),
      editableNote("Defects and actions", "Identify any risk and recommendations below."),
      { label: "Defects, risks and actions", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Advice for tenants",
    fields: [
      { label: "Advice given on Legionella risk and tenant responsibilities?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Assessor signature", type: "SIGNATURE" },
      editableNote("Please note", "Review this assessment at least annually and sooner if circumstances change."),
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-legionella-risk-assessment-visible-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Legionella risk assessment (reference notes visible)", inspectionType: "legionella", propertyType: null },
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
