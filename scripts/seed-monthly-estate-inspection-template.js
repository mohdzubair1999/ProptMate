// Creates the "Monthly Estate Inspection" template.
// Run with: node --env-file=.env scripts/seed-monthly-estate-inspection-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];

function qp(label, opts = YES_NO) {
  return [
    { label, type: "DROPDOWN", options: opts },
    { label: "Photos", type: "PHOTO" },
  ];
}

const sections = [
  {
    title: "External areas",
    fields: [
      ...qp("All lights functioning correctly?"),
      ...qp("All signage intact and graffiti-free?"),
      ...qp("Visual check — house glazing and doors in good condition?"),
      ...qp("All fences and gates in good working condition?"),
      ...qp("Gardens maintained correctly?"),
      ...qp("Planting maintained correctly?"),
      ...qp("Beds free from weeds and tidy?"),
      ...qp("Site free from leaves?"),
      ...qp("Site tidy and free from litter?"),
      ...qp("Any signs of pest activity?"),
      ...qp("Any graffiti identified?"),
      ...qp("All resident bins stored correctly and free from ignition sources?"),
      { label: "All cars parked correctly and not causing obstruction?", type: "DROPDOWN", options: YES_NO },
      { label: "If not, please note car registration and type", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
      ...qp("Any trip or slip hazards identified?"),
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Safety inspection — walkways",
    fields: [
      ...qp("Walkways in good condition, no cracks, dips or holes"),
      ...qp("Drains and drain covers in good condition, level and unobstructed"),
      ...qp("Manholes and openings to confined spaces are secure and undamaged"),
      ...qp("Outdoor lighting is in good working order"),
    ],
  },
  {
    title: "Safety inspection — changes in level",
    fields: [
      ...qp("Stairs free from damage, with contrasting edge strips and handrails"),
      ...qp("Fall-from-height areas have edge protection or natural barriers"),
      ...qp("Walls and retaining walls free from damage (cracks, bowing, loose sections)"),
    ],
  },
  {
    title: "Safety inspection — landscaping",
    fields: [
      ...qp("Landscaped areas well maintained"),
      ...qp("No evidence of waste, biohazards, glass or needlestick hazards"),
      ...qp("Trees healthy and free of dead or overhanging branches"),
    ],
  },
  {
    title: "Safety inspection — private roads",
    fields: [
      ...qp("Ground conditions good, no cracks, dips or holes"),
      ...qp("Road markings appropriate and clearly legible"),
      ...qp("Road signs in place, undamaged and legible"),
      ...qp("Emergency service access and parking areas clearly marked"),
    ],
  },
  {
    title: "Safety inspection — furnishings",
    fields: [
      ...qp("Fences in good condition (no damage to posts or panels)"),
      ...qp("Benches and external furniture free from damage or sharp edges"),
      ...qp("Bollards highlighted and free from damage"),
    ],
  },
  {
    title: "Safety inspection — plant equipment",
    fields: [
      ...qp("Powered gates in good condition, guards/strips/trips working"),
      ...qp("Powered barriers in good condition, guards/strips/trips working"),
      ...qp("EV chargers in good condition with no obvious signs of damage"),
    ],
  },
  {
    title: "Safety inspection — playgrounds",
    fields: [
      ...qp("No evidence of waste, biohazards, glass or needlestick hazards"),
      ...qp("Flooring in good condition, no cracks, dips or holes"),
      ...qp("Barriers, fences and gates secure and undamaged"),
      ...qp("Safety surfaces undamaged and free from trip hazards"),
      ...qp("Loose-fill surfaces level, at least 300mm deep, no fouling"),
      ...qp("Timber and metalwork undamaged and corrosion-free"),
      ...qp("Equipment supports secure in the ground, all fixings secure"),
      ...qp("Equipment chains/cables free from damage (bolts/welds)"),
    ],
  },
  {
    title: "Additional external notes",
    fields: [
      { label: "Any other areas of concern to note?", type: "DROPDOWN", options: YES_NO },
      { label: "If yes, please detail", type: "GRID_SECTION", options: "Notes" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Empty homes (if applicable)",
    fields: [
      { label: "House clean and free from damage?", type: "DROPDOWN", options: YES_NO },
      { label: "Have all taps been flushed?", type: "DROPDOWN", options: YES_NO },
      { label: "Is heating working?", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Show home (if applicable)",
    fields: [
      { label: "Furniture functional and free from damage?", type: "DROPDOWN", options: YES_NO },
      { label: "Photos", type: "PHOTO" },
      { label: "Cleaning to standard?", type: "DROPDOWN", options: YES_NO },
      { label: "Photos", type: "PHOTO" },
      { label: "Windows clean?", type: "DROPDOWN", options: YES_NO },
      { label: "Photos", type: "PHOTO" },
      { label: "Heating works correctly?", type: "DROPDOWN", options: YES_NO },
      { label: "Lighting working correctly?", type: "DROPDOWN", options: YES_NO },
      { label: "All appliances work correctly?", type: "DROPDOWN", options: YES_NO },
      { label: "Burglar alarm not bleeping and fault-free?", type: "DROPDOWN", options: YES_NO },
      { label: "CO2 monitor checked, not showing red?", type: "DROPDOWN", options: YES_NO },
      { label: "All taps run and flushed?", type: "DROPDOWN", options: YES_NO },
      { label: "Bins tidy and free from ignition sources?", type: "DROPDOWN", options: YES_NO },
      { label: "Photos", type: "PHOTO" },
      { label: "Post reviewed and destroyed/reviewed appropriately?", type: "DROPDOWN", options: YES_NO },
      { label: "TV working and streaming correctly?", type: "DROPDOWN", options: YES_NO },
      { label: "Security walk of site complete?", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-monthly-estate-inspection-template.js YOUR_COMPANY_ID");
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
      name: "Monthly Estate Inspection",
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
