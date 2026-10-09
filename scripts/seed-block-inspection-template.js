// Creates the "Block Inspection Report" template.
// Run with: node --env-file=.env scripts/seed-block-inspection-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const CONDITION_SCALE = ["Move-in ready", "Minor attention", "Needs action", "Priority repair"];
const CONDITION_SCALE_UNABLE = [...CONDITION_SCALE, "Unable to inspect"];
const CONDITION_SCALE_NA = [...CONDITION_SCALE, "N/A"];
const CONDITION_SCALE_UNABLE_TEST = [...CONDITION_SCALE, "Unable to test"];
const YES_NO_NA = ["Yes", "No", "N/A"];

const sections = [
  { title: "General information", fields: [{ label: "Reason for this assessment", type: "TEXT" }] },
  {
    title: "About this report",
    fields: [
      {
        label: "Scope of this report",
        type: "TEXT",
        options:
          "This report covers the condition of the property and surrounding estate, based on all accessible areas at the time of inspection. The inspector is not a qualified tradesperson and reports only what's identifiable through visual inspection or a basic function test.",
      },
    ],
  },
  {
    title: "The building",
    fields: [
      { label: "Number of floors", type: "NUMBER" },
      { label: "Use category", type: "SHORT_TEXT" },
      { label: "Approximate age of construction", type: "SHORT_TEXT" },
      { label: "Construction details", type: "TEXT" },
    ],
  },
  {
    title: "Building exterior",
    fields: [
      { label: "Roof, gutters and rainwater downpipes", type: "DROPDOWN", options: CONDITION_SCALE_UNABLE },
      { label: "Walls", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Waste and soil pipes", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Aerials", type: "DROPDOWN", options: CONDITION_SCALE_UNABLE },
      { label: "Windows", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Doors", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Lighting", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Garden and external areas",
    fields: [
      { label: "Refuse", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Gardens", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Pathway", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Steps", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Handrails", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Lighting", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Signage", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Building interior",
    fields: [
      { label: "Were internal communal areas accessible for inspection?", type: "YES_NO" },
      { label: "If not, why?", type: "SHORT_TEXT" },
      { label: "Floors", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Walls", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Ceilings", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Staircases", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Doors", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Lift", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Riser cupboards", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "Cupboards", type: "DROPDOWN", options: CONDITION_SCALE_NA },
      { label: "General lighting", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Emergency lighting", type: "DROPDOWN", options: CONDITION_SCALE_UNABLE_TEST },
      { label: "Smoke detectors and fire alarms", type: "DROPDOWN", options: CONDITION_SCALE_UNABLE_TEST },
      { label: "Signage", type: "DROPDOWN", options: CONDITION_SCALE },
      { label: "Fire safety signage in place and undamaged", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Public health notices in place and undamaged", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Recommendations",
    fields: [
      { label: "Recommended works", type: "TEXT" },
      { label: "Accompanying photos", type: "PHOTO" },
    ],
  },
  { title: "Additional comments", fields: [{ label: "Additional comments", type: "TEXT" }] },
  { title: "Ongoing matters", fields: [{ label: "Ongoing matters", type: "TEXT" }] },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-block-inspection-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Block Inspection Report", inspectionType: "mid-term", propertyType: null },
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
