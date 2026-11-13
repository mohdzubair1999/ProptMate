// Creates the "Residential Inspection — Room by Room (incl. Awaab's Law and RRB)" template.
// Run with: node --env-file=.env scripts/seed-residential-room-by-room-awaabs-rrb-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];
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

const GRID_GUIDANCE =
  "Log each area separately by tapping the plus symbol and filling out the details, then save. Alternatively, skip the table and add detail in the comments below.";

const sections = [
  {
    title: "About this report",
    fields: [
      {
        label: "Declaration",
        type: "TERMS",
        options: "This report assesses the property against current health, safety and tenancy standards, including Awaab's Law duties and Renters' Reform Bill provisions.",
      },
    ],
  },
  {
    title: "General information",
    fields: [
      { label: "Tenant(s) present", type: "DROPDOWN", options: YES_NO },
      { label: "Weather at time of inspection", type: "DROPDOWN", options: ["Dry", "Wet", "Snow", "Windy", "N/A"] },
      {
        label: "Reason for this inspection",
        type: "DROPDOWN",
        options: ["Concern raised by tenant", "Concern flagged within routine inspection", "Routine inspection", "Other", "N/A"],
      },
      { label: "If other, please detail", type: "TEXT" },
    ],
  },
  ...rooms.map((room) => ({ title: room, fields: roomBlock() })),
  {
    title: "Health & safety compliance (incl. Awaab's Law) — damp & mould",
    fields: [
      { label: "Signs of damp or mould?", type: "DROPDOWN", options: YES_NO },
      { label: "Inspector guidance", type: "INFO_TEXT", options: GRID_GUIDANCE },
      { label: "If yes, please provide details", type: "GRID_SECTION", options: "Damp & mould — Awaab's Law severity" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety compliance (incl. Awaab's Law) — adequate ventilation",
    fields: [
      { label: "Windows openable and in working order?", type: "DROPDOWN", options: YES_NO },
      { label: "Trickle vents fitted and operational?", type: "DROPDOWN", options: YES_NO },
      { label: "Mechanical ventilation (where required) operational?", type: "DROPDOWN", options: YES_NO },
      { label: "Extractor vents visibly clean and unobstructed?", type: "DROPDOWN", options: YES_NO },
      { label: "Signs of condensation?", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety compliance (incl. Awaab's Law) — fire safety",
    fields: [
      {
        label: "Smoke alarms fitted?",
        type: "DROPDOWN",
        options: ["Yes — mains operated", "Yes — battery powered", "Yes — combination of mains and battery", "No"],
      },
      {
        label: "Smoke alarms tested?",
        type: "MULTIPLE_CHOICE",
        options: ["Yes — working, green light visible", "Yes — working, sound heard", "No — out of reach", "No — unable to test, battery missing"],
      },
      {
        label: "Carbon monoxide detectors present?",
        type: "DROPDOWN",
        options: ["Yes", "No — but gas appliances in situ", "No — not required, no gas appliances"],
      },
      { label: "Clear means of escape?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Fire doors where required?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Fire blanket present in kitchen?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "For HMOs only — emergency lighting operational?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Last known Fire Risk Assessment test or inspection date", type: "SHORT_TEXT" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Pets (Renters' Reform Bill)",
    fields: [
      { label: "Permission granted for pets?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Are pets present?", type: "DROPDOWN", options: ["Yes", "No", "None observed"] },
      { label: "Evidence of pet-related damage?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Inspector guidance", type: "INFO_TEXT", options: GRID_GUIDANCE },
      { label: "If yes, please provide details", type: "GRID_SECTION", options: "Pets (RRB) — damage" },
      { label: "Any concerns regarding pet management?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Additional findings",
    fields: [
      { label: "Signs of leaks", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of smoking", type: "DROPDOWN", options: ["Yes — permitted", "Yes — not permitted", "No", "N/A"] },
      { label: "Evidence of unauthorised occupancy", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Resident engagement & feedback",
    fields: [
      { label: "Resident advised on ventilation and moisture management?", type: "DROPDOWN", options: ["Yes", "No", "Not present at time of inspection"] },
      { label: "Resident acknowledged report contents?", type: "DROPDOWN", options: ["Yes", "No", "Not present at time of inspection"] },
      { label: "Please detail any concerns raised by resident at time of inspection", type: "TEXT" },
      { label: "Photos (if required)", type: "PHOTO" },
    ],
  },
  {
    title: "Inspector declaration",
    fields: [
      { label: "Inspector confirms awareness of Awaab's Law and current damp/mould reporting protocols", type: "DROPDOWN", options: YES_NO },
      { label: "Is the property considered safe and free from Category 1 hazards?", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Inspector signature", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-residential-room-by-room-awaabs-rrb-template.js YOUR_COMPANY_ID");
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
      name: "Residential Inspection — Room by Room (incl. Awaab's Law and RRB)",
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
