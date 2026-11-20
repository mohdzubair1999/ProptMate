// Creates the "Mid Term: Room (HMO)" template — reconstructed and redesigned.
// Uses our own Room Condition scale and a consolidated licence compliance section
// instead of four near-duplicate blocks.
// Run with: node --env-file=.env scripts/seed-room-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ROOM_CONDITION = [
  "Move-in ready — no issues identified",
  "Minor attention — cosmetic only, no action needed now",
  "Needs action — schedule follow-up",
  "Priority repair — address as soon as possible",
];

function roomFields() {
  return [
    { label: "Room condition rating", type: "DROPDOWN", options: ROOM_CONDITION },
    { label: "What did you observe?", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const rooms = [
  "Communal hallway",
  "Room",
  "Kitchen area in room",
  "Bathroom area in room",
  "Communal kitchen",
  "Communal kitchen 2",
  "Communal reception",
  "Communal bathroom",
  "Communal bathroom 2",
];

const sections = [
  {
    title: "About this inspection",
    fields: [
      { label: "Tenant(s) present at inspection?", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
      { label: "Weather conditions", type: "DROPDOWN", options: ["N/A", "Dry", "Wet", "Snow and ice", "Windy"] },
    ],
  },
  ...rooms.map((room) => ({ title: room, fields: roomFields() })),
  {
    title: "Safety",
    fields: [
      {
        label: "Smoke detector location",
        type: "DROPDOWN",
        options: ["N/A", "Not located", "Hallway", "Hallway and landing(s)", "Hallway, landings and bedrooms", "Other"],
      },
      { label: "Smoke detector(s) tested and working", type: "DROPDOWN", options: ["N/A", "Yes", "No — unable to test", "One or more not working"] },
      { label: "CO detector location", type: "DROPDOWN", options: ["N/A", "Unable to locate", "Kitchen", "Utility room", "Living room", "Bedroom", "Other"] },
      { label: "CO detector tested and working", type: "DROPDOWN", options: ["N/A", "Yes", "No — unable to test"] },
      { label: "Fire extinguisher location", type: "DROPDOWN", options: ["N/A", "Unable to locate", "Hallway", "Kitchen", "Hallway and landing(s)"] },
      { label: "Fire extinguisher gauge in-date", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
      { label: "Fire blanket location", type: "DROPDOWN", options: ["N/A", "Unable to locate", "Kitchen"] },
      { label: "Fire blanket mounted with visible instructions", type: "DROPDOWN", options: ["N/A", "Unable to locate", "Yes", "No"] },
      { label: "Follow-up safety notes", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Property exterior",
    fields: [
      { label: "Balcony visually inspected", type: "DROPDOWN", options: ["N/A", "Yes", "No — unable to view"] },
      { label: "Balcony condition", type: "DROPDOWN", options: ["N/A", "Good condition", "Weatherworn", "Untidy / rubbish"] },
      { label: "Follow-up exterior maintenance noted", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety review — damp and mould",
    fields: [
      { label: "Any signs of damp or mould observed?", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "Severity", type: "DROPDOWN", options: ["No concern", "Monitor — recheck at next visit", "Address within 28 days", "Urgent — address within 7 days"] },
      { label: "Location(s) and extent", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety review — ventilation",
    fields: [
      { label: "Extractor fans working and unobstructed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Any condensation observed?", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "Severity", type: "DROPDOWN", options: ["No concern", "Monitor — recheck at next visit", "Address within 28 days", "Urgent — address within 7 days"] },
      { label: "Notes", type: "TEXT" },
    ],
  },
  {
    title: "Additional findings",
    fields: [
      { label: "Evidence of pets", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
      { label: "Evidence of smoking", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
      { label: "Evidence of candles or naked flames", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
      { label: "Evidence of unauthorised occupancy", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
      { label: "Further details, if necessary", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Overall impressions",
    fields: [
      { label: "Overall property standard", type: "DROPDOWN", options: ["Excellent", "Good", "Fair — some attention needed", "Poor — action required"] },
      {
        label: "Anticipated matters at end of tenancy",
        type: "DROPDOWN",
        options: ["N/A", "None", "Cleanliness", "Exterior condition", "Decor wear and tear", "Cleanliness and decor wear and tear"],
      },
    ],
  },
  {
    title: "Maintenance report",
    fields: [
      { label: "Any issues to report?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Details of any issues", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Licence & compliance — core checklist",
    fields: [
      {
        label: "About this section",
        type: "INFO_TEXT",
        options: "These checks apply regardless of licence type. Complete the HMO addendum below if the property holds an HMO licence.",
      },
      { label: "Kitchen door meets fire-check spec (rated hinges, self-closer, seals, thumb-turn lock)?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Bathroom extractor fan working?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Kitchen extractor fan working?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Licence displayed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Emergency lighting operational (if required)?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Common areas clear of obstructions?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "No locks fitted to bedroom doors (where required)?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Licence & compliance — HMO addendum",
    fields: [
      {
        label: "Which licence type applies?",
        type: "DROPDOWN",
        options: ["None — not an HMO", "Selective licence", "Additional HMO licence", "Mandatory HMO licence", "Section 257 HMO"],
      },
      { label: "Interlinked smoke alarms and heat detector fitted per flat/unit?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Staircases with storage are fire-proofed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Meters and fuse boxes in fire-proofed enclosures?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Fire safety signage displayed throughout common areas?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Entrance to main door clear of trip hazards?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "CO alarm present and working (if gas supply present)?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Comments", type: "TEXT" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-room-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Mid Term: Room (HMO)", inspectionType: "mid-term", propertyType: "room" },
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
