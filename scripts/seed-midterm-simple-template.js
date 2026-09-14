// Creates the "Mid-Term: Inspection (simple)" template.
// Run with: node --env-file=.env scripts/seed-midterm-simple-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ROOM_CONDITION = [
  "Move-in ready — no issues identified",
  "Minor attention — cosmetic only, no action needed now",
  "Needs action — schedule follow-up",
  "Priority repair — address as soon as possible",
];

function roomBlock() {
  return [
    { label: "Room condition rating", type: "DROPDOWN", options: ROOM_CONDITION },
    { label: "What did you observe?", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const YES_NO = ["No", "Yes"];

const rooms = [
  "Exterior — front",
  "Exterior — rear",
  "Entrance hall",
  "Downstairs W.C.",
  "Living room",
  "Dining room",
  "Inner hallway",
  "Kitchen",
  "Utility room",
  "Stairs and landing",
  "Bathroom",
  "Bedroom 1",
  "Ensuite 1",
  "Bedroom 2",
  "Ensuite 2",
  "Bedroom 3",
  "Bedroom 4",
  "Bedroom 5",
  "Bedroom 6",
  "Spare room 1",
  "Spare room 2",
];

const sections = [
  {
    title: "Declaration",
    fields: [
      {
        label: "Declaration",
        type: "TERMS",
        options: "This report reflects the condition of the property as observed at the time of inspection.",
      },
    ],
  },
  {
    title: "General information",
    fields: [
      { label: "Tenant(s) present", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "Weather at time of inspection", type: "DROPDOWN", options: ["Dry", "Wet", "Snow", "Windy", "N/A"] },
    ],
  },
  ...rooms.map((room) => ({ title: room, fields: roomBlock() })),
  {
    title: "Health & safety review — damp, mould and ventilation",
    fields: [
      { label: "Any signs of damp or mould observed?", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "Severity", type: "DROPDOWN", options: ["No concern", "Monitor — recheck at next visit", "Address within 28 days", "Urgent — address within 7 days"] },
      { label: "Location(s) and extent", type: "TEXT" },
      { label: "Extractor fans working and unobstructed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Any condensation observed?", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Licence & compliance — core checklist",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "These checks apply regardless of licence type. Complete the HMO addendum below if the property holds an HMO licence." },
      { label: "Kitchen door meets fire-check spec?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Bathroom extractor fan working?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Kitchen extractor fan working?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Licence displayed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Licence & compliance — HMO addendum",
    fields: [
      { label: "Which licence type applies?", type: "DROPDOWN", options: ["None — not an HMO", "Selective licence", "Additional HMO licence", "Mandatory HMO licence", "Section 257 HMO"] },
      { label: "Interlinked smoke alarms and heat detector fitted per unit?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Additional findings",
    fields: [
      { label: "Signs of damp / mould?", type: "DROPDOWN", options: YES_NO },
      { label: "Signs of leaks", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of smoking", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of candles", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of pets", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of unauthorised occupancy", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Advisory and maintenance issues",
    fields: [
      {
        label: "Inspector guidance",
        type: "INFO_TEXT",
        options: "Log each advisory or maintenance issue separately by tapping the plus symbol below, then save. Repeat for further issues.",
      },
      { label: "Advisory and maintenance issues", type: "GRID_SECTION", options: "Anticipated maintenance or advisory issues" },
      { label: "Additional comments (if required)", type: "TEXT" },
      { label: "Additional photos (if required)", type: "PHOTO" },
    ],
  },
  {
    title: "Safety",
    fields: [
      {
        label: "Inspector guidance",
        type: "INFO_TEXT",
        options:
          "Log the safety devices in the property by tapping the plus symbol below. Select a device from the list, answer the remaining questions, then save. Repeat for further devices.",
      },
      { label: "Safety devices", type: "GRID_SECTION", options: "Safety devices" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Utilities",
    fields: [
      {
        label: "Inspector guidance",
        type: "INFO_TEXT",
        options:
          "Log meters and readings in the property by tapping the plus symbol below. Select the service from the list, answer the remaining questions, then save. Repeat for further meters.",
      },
      { label: "Meter readings", type: "GRID_SECTION", options: "Meter readings" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-midterm-simple-template.js YOUR_COMPANY_ID");
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
      name: "Mid-Term: Inspection (simple)",
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
