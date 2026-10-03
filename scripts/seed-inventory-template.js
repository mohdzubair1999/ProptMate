// Generic seeder for the "Inventory: X-bed [property type]" template series. Furnishing
// status is captured per-inspection now (Summary Reference section), not baked into the
// template name.
// Run with: node --env-file=.env scripts/seed-inventory-template.js YOUR_COMPANY_ID KEY
// Run with no KEY to list available keys.

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

function scheduleOfConditionFields(config) {
  const exteriorFields =
    config.exteriorMode === "external-space"
      ? [
          {
            label: "External space / balcony condition",
            type: "DROPDOWN",
            options: ["Well maintained and tidy", "Reasonable", "Untidy, needs attention", "N/A"],
          },
        ]
      : [
          { label: "Grass / lawns", type: "DROPDOWN", options: ["Recently cut", "Slightly overlong", "Overlong", "N/A"] },
          { label: "Garden / grounds", type: "DROPDOWN", options: ["Well maintained and tidy", "Reasonable", "Untidy, needs attention", "N/A"] },
        ];

  return [
    ...exteriorFields,
    { label: "Exterior windows", type: "DROPDOWN", options: ["Recently cleaned", "Reasonable", "Below standard"] },
    { label: "Interior windows", type: "DROPDOWN", options: ["Recently cleaned", "Reasonable", "Below standard"] },
    {
      label: "Carpets / flooring",
      type: "DROPDOWN",
      options: ["New", "Professionally cleaned", "Domestically cleaned", "Not cleaned / vacuumed", "Marked, stained or scratched", "N/A"],
    },
    {
      label: "Decor",
      type: "DROPDOWN",
      options: ["Newly decorated", "Minor wear and tear", "Average wear and tear", "Heavy wear and tear"],
    },
    { label: "Kitchen", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard"] },
    { label: "Oven", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard", "N/A"] },
    { label: "Kitchen appliances", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard", "N/A"] },
    { label: "Light fittings", type: "DROPDOWN", options: ["All working", "Mostly working, exceptions noted", "Bulbs missing", "None working"] },
    { label: "Mould and mildew", type: "DROPDOWN", options: ["None visible", "Slight, as noted", "Heavy, as noted"] },
    { label: "Bathroom(s) and sanitaryware", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard"] },
    { label: "Overall cleanliness of property", type: "DROPDOWN", options: ["Professionally cleaned", "Domestically cleaned", "Attention required"] },
    { label: "Comments", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
    { label: "— Page break —", type: "PAGE_BREAK" },
  ];
}

function buildSections(config) {
  return [
    {
      title: "General information",
      fields: [
        { label: "Property type", type: "DROPDOWN", options: ["House", "Apartment", "Bungalow", "Dormer bungalow", "Flat", "Studio", "Maisonette"] },
        { label: "Number of bedrooms", type: "NUMBER" },
        { label: "Is the property occupied?", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
        { label: "Is the property furnished?", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
        { label: "— Page break —", type: "PAGE_BREAK" },
      ],
    },
    { title: "Schedule of condition", fields: scheduleOfConditionFields(config) },
    {
      title: "Utility readings — gas and electric",
      fields: [
        { label: "Electric reading", type: "NUMBER" },
        { label: "Electric meter reference and location", type: "SHORT_TEXT" },
        { label: "Gas reading", type: "NUMBER" },
        { label: "Gas meter reference and location", type: "SHORT_TEXT" },
        { label: "Comments", type: "TEXT" },
        { label: "Photos", type: "PHOTO" },
      ],
    },
    {
      title: "Utility readings — water and oil",
      fields: [
        { label: "Water reading", type: "NUMBER" },
        { label: "Water meter reference and location", type: "SHORT_TEXT" },
        { label: "Oil reading", type: "NUMBER" },
        { label: "Oil meter reference and location", type: "SHORT_TEXT" },
        { label: "Comments", type: "TEXT" },
        { label: "Photos", type: "PHOTO" },
      ],
    },
    {
      title: "Deposit protection",
      fields: [
        { label: "Deposit protected in a government-approved scheme?", type: "DROPDOWN", options: ["Yes", "No", "N/A — no deposit taken"] },
        { label: "Scheme used", type: "DROPDOWN", options: ["TDS", "Deposit Protection Service (DPS)", "mydeposits", "N/A"] },
        { label: "Date deposit was protected", type: "DATE" },
        { label: "Prescribed information provided to tenant(s) within 30 days?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
        { label: "Deposit certificate / reference number", type: "SHORT_TEXT" },
      ],
    },
    {
      title: "Keys to the property",
      fields: [
        { label: "Front door (Yale)", type: "NUMBER" },
        { label: "Front door (mortice)", type: "NUMBER" },
        { label: "Back door (Yale)", type: "NUMBER" },
        { label: "Back door (mortice)", type: "NUMBER" },
        { label: "Security fob", type: "NUMBER" },
        { label: "Shed / outhouse", type: "NUMBER" },
        { label: "Garage", type: "NUMBER" },
        { label: "Patio", type: "NUMBER" },
        { label: "Window", type: "NUMBER" },
        { label: "Postbox", type: "NUMBER" },
        { label: "Other keys", type: "TEXT" },
        { label: "Photo of keys", type: "PHOTO" },
      ],
    },
    {
      title: "Forwarding address",
      fields: [
        { label: "Names of tenant(s) present at check-out", type: "TEXT" },
        { label: "Tenant(s) forwarding address", type: "TEXT" },
      ],
    },
    {
      title: "Safety",
      fields: [
        { label: "Location of smoke detector(s)", type: "DROPDOWN", options: ["N/A", "Hallway", "Hallway and landing", "Other"] },
        { label: "Smoke detector(s) tested and working?", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
        { label: "Location of CO detector(s)", type: "DROPDOWN", options: ["Kitchen", "Utility room", "Living room", "Bathroom", "N/A", "Other"] },
        { label: "CO detector(s) tested and working?", type: "DROPDOWN", options: ["N/A", "Yes", "No"] },
        { label: "Comments", type: "TEXT" },
        { label: "— Page break —", type: "PAGE_BREAK" },
      ],
    },
    ...config.rooms.map((room, i) => ({
      title: room,
      hidden: (config.hiddenRooms || []).includes(room),
      fields: [
        { label: `${room} — item list`, type: "INVENTORY_SECTION" },
        { label: "Comments", type: "TEXT" },
        { label: "Photos", type: "PHOTO" },
        ...(i < config.rooms.length - 1 ? [{ label: "— Page break —", type: "PAGE_BREAK" }] : []),
      ],
    })),
    {
      title: "Declaration",
      fields: [{ label: "Declaration", type: "TERMS", options: "This inventory reflects the condition and contents of the property at the start of the tenancy." }],
    },
    {
      title: "Signatures",
      fields: [
        { label: "Tenant signature", type: "SIGNATURE" },
        { label: "Inspector signature", type: "SIGNATURE" },
      ],
    },
  ];
}

const TEMPLATES = {
  "1bed-apartment": {
    name: "Inventory: 1-bed apartment (unfurnished)",
    propertyType: "flat",
    rooms: ["Hallway", "Storage cupboard", "Reception room", "Kitchen", "Bathroom", "Bedroom", "Spare room (if needed)"],
  },
  "1bed-house": {
    name: "Inventory: 1-bed house (unfurnished)",
    propertyType: "house",
    rooms: [
      "Hallway",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Kitchen",
      "Stairs and landing",
      "Bedroom",
      "Bathroom",
      "Spare room (if needed)",
      "Garden",
    ],
  },
  "2bed-apartment": {
    name: "Inventory: 2-bed apartment (unfurnished)",
    propertyType: "flat",
    rooms: [
      "Hallway",
      "Storage cupboard",
      "Reception room",
      "Kitchen",
      "Bathroom",
      "Bedroom 1",
      "Bedroom 2",
      "Ensuite",
      "External space / balcony",
      "Spare room (if needed)",
    ],
  },
  "2bed-house": {
    name: "Inventory: 2-bed house (unfurnished)",
    propertyType: "house",
    rooms: [
      "Hallway",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bathroom",
      "Spare room (if needed)",
      "Garden",
    ],
  },
  "3bed-apartment": {
    name: "Inventory: 3-bed apartment (unfurnished)",
    propertyType: "flat",
    exteriorMode: "external-space",
    rooms: [
      "Hallway",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Kitchen",
      "Bathroom",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bedroom 3",
      "External space / balcony",
      "Spare room (if needed)",
    ],
  },
  "3bed-house": {
    name: "Inventory: 3-bed house (unfurnished)",
    propertyType: "house",
    hiddenRooms: ["Bathroom 2"],
    rooms: [
      "Hallway",
      "Downstairs W.C.",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Conservatory",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bathroom",
      "Bathroom 2",
      "Bedroom 3",
      "Spare room (if needed)",
      "Garage",
      "Garden",
    ],
  },
  "4bed-apartment": {
    name: "Inventory: 4-bed apartment (unfurnished)",
    propertyType: "flat",
    exteriorMode: "external-space",
    rooms: [
      "Hallway",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Kitchen",
      "Bathroom",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bedroom 3",
      "Bedroom 4",
      "External space / balcony",
      "Spare room (if needed)",
    ],
  },
  "4bed-house": {
    name: "Inventory: 4-bed house (unfurnished)",
    propertyType: "house",
    hiddenRooms: ["Bathroom 2"],
    rooms: [
      "Hallway",
      "Downstairs W.C.",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Reception room 3",
      "Conservatory",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bathroom",
      "Bathroom 2",
      "Stairs and landing 2",
      "Bedroom 3",
      "Ensuite 2",
      "Bedroom 4",
      "Spare room (if needed)",
      "Garage",
      "Garden",
    ],
  },
  "5bed-house": {
    name: "Inventory: 5-bed house (unfurnished)",
    propertyType: "house",
    hiddenRooms: ["Bathroom 2"],
    rooms: [
      "Hallway",
      "Downstairs W.C.",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Reception room 3",
      "Conservatory",
      "Kitchen",
      "Utility room",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bathroom",
      "Bathroom 2",
      "Stairs and landing 2",
      "Bedroom 3",
      "Ensuite 2",
      "Bedroom 4",
      "Bedroom 5",
      "Spare room (if needed)",
      "Garage",
      "Garden",
    ],
  },
  "6bed-house": {
    name: "Inventory: 6-bed house (unfurnished)",
    propertyType: "house",
    hiddenRooms: ["Bathroom 3"],
    rooms: [
      "Hallway",
      "Downstairs W.C.",
      "Storage cupboard",
      "Reception room",
      "Reception room 2",
      "Reception room 3",
      "Reception room 4",
      "Conservatory",
      "Kitchen",
      "Utility room",
      "Spare room (if needed)",
      "Stairs and landing",
      "Bedroom 1",
      "Ensuite",
      "Bedroom 2",
      "Bathroom",
      "Bathroom 2",
      "Bathroom 3",
      "Stairs and landing 2",
      "Bedroom 3",
      "Ensuite 2",
      "Bedroom 4",
      "Bedroom 5",
      "Bedroom 6",
      "Garage",
      "Garden",
      "Garden 2",
      "Spare room (if needed) 2",
    ],
  },
  studio: {
    name: "Inventory: Studio (unfurnished)",
    propertyType: "studio",
    exteriorMode: "external-space",
    rooms: ["Hallway", "Studio room", "Kitchen area of studio", "Bathroom area in studio"],
  },
  room: {
    name: "Inventory: Room (HMO, unfurnished)",
    propertyType: "room",
    exteriorMode: "external-space",
    rooms: [
      "Communal hallway",
      "Room",
      "Kitchen area in room",
      "Bathroom area in room",
      "Communal kitchen",
      "Communal reception",
      "Communal bathroom",
    ],
  },
};

async function main() {
  const companyId = process.argv[2];
  const key = process.argv[3];

  if (!companyId || !key || !TEMPLATES[key]) {
    console.error("Usage: node --env-file=.env scripts/seed-inventory-template.js YOUR_COMPANY_ID KEY");
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
    data: { companyId, name: config.name, inspectionType: "check-in", propertyType: config.propertyType },
  });

  const sections = buildSections(config);

  for (let s = 0; s < sections.length; s++) {
    const section = sections[s];
    const createdSection = await prisma.templateSection.create({
      data: { templateId: template.id, title: section.title, order: s, hidden: section.hidden || false },
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
