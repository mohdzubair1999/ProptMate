// Generic seeder for the "Mid Term: X-bed [property type]" template series.
// Uses our own Room Condition rating scale (not TouchRight's twin cleanliness/decor scoring).
// Run with: node --env-file=.env scripts/seed-midterm-template.js YOUR_COMPANY_ID KEY
// Run with no KEY to list available keys.

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

function propertyExteriorFields(config) {
  if (config.exteriorType === "house") {
    return [
      { label: "Roof, guttering and drains visually inspected", type: "DROPDOWN", options: ["N/A", "Yes", "No — unable to view"] },
      {
        label: "Roof / guttering / drains condition",
        type: "DROPDOWN",
        options: ["N/A", "Good condition", "Cracked tiles and/or guttering", "Blocked with leaves/rubbish", "Requires landlord attention"],
      },
      {
        label: "Yard / garden / shed / fences / garage visually inspected",
        type: "DROPDOWN",
        options: ["N/A", "Yes", "No — unable to inspect", "Partially inspected"],
      },
      {
        label: "Yard / garden / shed / fences / garage condition",
        type: "DROPDOWN",
        options: ["N/A", "Tidy and well maintained", "Satisfactory", "Untidy, not well maintained", "Some areas require attention"],
      },
      { label: "Follow-up exterior maintenance noted", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ];
  }
  return [
    { label: "Balcony visually inspected", type: "DROPDOWN", options: ["N/A", "Yes", "No — unable to view"] },
    { label: "Balcony condition", type: "DROPDOWN", options: ["N/A", "Good condition", "Weatherworn", "Untidy / rubbish"] },
    { label: "Follow-up exterior maintenance noted", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const HAZARD_SEVERITY = ["No concern", "Monitor — recheck at next visit", "Address within 28 days", "Urgent — address within 7 days"];

function buildSections(config) {
  return [
    {
      title: "About this inspection",
      fields: [
        {
          label: "Our approach",
          type: "TERMS",
          options: "This inspection covers room-by-room condition, a health and safety review under Awaab's Law, and licence compliance where applicable.",
        },
        { label: "Tenant(s) present at inspection?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
        { label: "Weather conditions", type: "DROPDOWN", options: ["Dry", "Wet", "Snow / ice", "Windy", "N/A"] },
      ],
    },
    ...config.rooms.map((room) => ({ title: room, fields: roomFields() })),
    {
      title: "Health & safety review — damp and mould",
      fields: [
        { label: "Any signs of damp or mould observed?", type: "DROPDOWN", options: ["Yes", "No"] },
        { label: "Severity", type: "DROPDOWN", options: HAZARD_SEVERITY },
        { label: "Location(s) and extent", type: "TEXT" },
        { label: "Photos", type: "PHOTO" },
      ],
    },
    {
      title: "Health & safety review — ventilation",
      fields: [
        { label: "Extractor fans working and unobstructed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
        { label: "Any condensation observed?", type: "DROPDOWN", options: ["Yes", "No"] },
        { label: "Severity", type: "DROPDOWN", options: HAZARD_SEVERITY },
        { label: "Notes", type: "TEXT" },
      ],
    },
    {
      title: "Safety",
      fields: [
        {
          label: "Smoke detector location",
          type: "DROPDOWN",
          options: ["N/A", "Not located", "Hallway", "Hallway and landing(s)", "Hallway, landings and bedrooms", "Other"],
        },
        {
          label: "Smoke detector(s) tested and working",
          type: "DROPDOWN",
          options: ["N/A", "Yes", "No — unable to test", "One or more not working, see details"],
        },
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
      fields: propertyExteriorFields(config),
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
        { label: "Staircases with storage are fire-proofed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
        { label: "Comments", type: "TEXT" },
      ],
    },
  ];
}

// ── Template variants — add a new entry here for each new one you paste ────

const TEMPLATES = {
  "1bed-apartment": {
    name: "Mid Term: 1-bed apartment",
    propertyType: "flat",
    rooms: ["Hall / entrance", "Living room", "Kitchen", "Bathroom", "Bedroom", "Spare room (if required)"],
  },
  "1bed-house": {
    name: "Mid Term: 1-bed house",
    propertyType: "house",
    exteriorType: "house",
    rooms: ["Hall / entrance", "Living room", "Kitchen", "Stairs and landing", "Bathroom", "Bedroom", "Spare room (if required)"],
  },
  "2bed-apartment": {
    name: "Mid Term: 2-bed apartment",
    propertyType: "flat",
    exteriorType: "house",
    rooms: ["Hall / entrance", "Living room", "Kitchen", "Bathroom", "Bedroom 1", "Bedroom 2", "Ensuite", "Spare room (if required)"],
  },
  "2bed-house": {
    name: "Mid Term: 2-bed house",
    propertyType: "house",
    exteriorType: "house",
    rooms: ["Hall / entrance", "Living room", "Kitchen", "Stairs and landing", "Bathroom", "Bedroom 1", "Bedroom 2", "Spare room (if required)"],
  },
  "3bed-apartment": {
    name: "Mid Term: 3-bed apartment",
    propertyType: "flat",
    exteriorType: "house",
    rooms: ["Hall / entrance", "Living room", "Kitchen", "Bathroom", "Bedroom 1", "Ensuite", "Bedroom 2", "Bedroom 3", "Spare room (if required)"],
  },
  "3bed-house": {
    name: "Mid Term: 3-bed house",
    propertyType: "house",
    exteriorType: "house",
    rooms: [
      "Hall / entrance",
      "Reception room 1",
      "Reception room 2",
      "Downstairs W.C.",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bedroom 3",
      "Bathroom",
      "Spare room (if required)",
    ],
  },
  "4bed-house": {
    name: "Mid Term: 4-bed house",
    propertyType: "house",
    exteriorType: "house",
    rooms: [
      "Hall / entrance",
      "Reception room 1",
      "Reception room 2",
      "Downstairs W.C.",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Bathroom",
      "Shower room",
      "Spare room (if required)",
    ],
  },
  "5bed-house": {
    name: "Mid Term: 5-bed house",
    propertyType: "house",
    exteriorType: "house",
    rooms: [
      "Hall / entrance",
      "Reception room 1",
      "Reception room 2",
      "Downstairs W.C.",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Bedroom 5",
      "Ensuite 2",
      "Bathroom",
      "Shower room",
      "Spare room (if required)",
    ],
  },
  "6bed-house": {
    name: "Mid Term: 6-bed house",
    propertyType: "house",
    exteriorType: "house",
    rooms: [
      "Hall / entrance",
      "Reception room 1",
      "Reception room 2",
      "Downstairs W.C.",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "Bedroom 5",
      "Ensuite 2",
      "Bedroom 6",
      "Bathroom",
      "Shower room",
      "Spare room (if required)",
    ],
  },
};

async function main() {
  const companyId = process.argv[2];
  const key = process.argv[3];

  if (!companyId || !key || !TEMPLATES[key]) {
    console.error("Usage: node --env-file=.env scripts/seed-midterm-template.js YOUR_COMPANY_ID KEY");
    console.error("\nAvailable keys:");
    Object.keys(TEMPLATES).forEach((k) => console.error(`  ${k}`));
    process.exit(1);
  }

  const config = TEMPLATES[key];

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: config.name, inspectionType: "mid-term", propertyType: config.propertyType },
  });

  const sections = buildSections(config);

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
