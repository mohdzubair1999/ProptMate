// Creates the "Temporary Accommodation Inspection Report — House/Flat" template.
// Run with: node --env-file=.env scripts/seed-temp-accommodation-inspection-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];
const YES_NO_NA = ["Yes", "No", "N/A"];
const FLOOR_COVERING = ["Carpet with underlay", "Vinyl", "Laminate"];

function bedroomBlock() {
  return [
    { label: "Photo", type: "PHOTO" },
    { label: "Door in satisfactory condition and with no latch", type: "DROPDOWN", options: YES_NO },
    { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
    { label: "Type of floor covering", type: "DROPDOWN", options: FLOOR_COVERING },
    { label: "Windows satisfactory with adequate ventilation", type: "DROPDOWN", options: YES_NO },
    { label: "Window restrictors fitted (opens no more than 100mm)", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
    { label: "2 or more double sockets in satisfactory condition", type: "DROPDOWN", options: YES_NO },
    { label: "Light switch fitted, satisfactory and working", type: "DROPDOWN", options: YES_NO },
    { label: "Curtains, nets or blinds in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "None present"] },
    { label: "Bed in satisfactory condition", type: "DROPDOWN", options: ["Yes — double", "Yes — single", "Not satisfactory — double"] },
    { label: "Chest of drawers in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "Not present"] },
    { label: "Wardrobe in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "Not present"] },
    { label: "Comments", type: "TEXT" },
  ];
}

function complianceSection(title, items) {
  return {
    title,
    fields: [...items.map((label) => ({ label, type: "DROPDOWN", options: YES_NO_NA })), { label: "Comments / notes", type: "TEXT" }],
  };
}

const sections = [
  {
    title: "Details",
    fields: [
      { label: "Tenant's name", type: "SHORT_TEXT" },
      { label: "Is tenant at home?", type: "DROPDOWN", options: YES_NO },
      { label: "Number of bedrooms", type: "SHORT_TEXT" },
    ],
  },
  {
    title: "Reapit details",
    fields: [
      { label: "Images on Reapit", type: "DROPDOWN", options: YES_NO },
      { label: "Description on Reapit", type: "DROPDOWN", options: YES_NO },
    ],
  },
  {
    title: "Property type",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Property type", type: "DROPDOWN", options: ["Flat", "House"] },
      { label: "If a flat", type: "DROPDOWN", options: ["Conversion", "Purpose built"] },
    ],
  },
  {
    title: "External front of property",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Visual inspection of roof — in good condition?", type: "DROPDOWN", options: YES_NO },
      { label: "Guttering secure and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Waste pipes secure and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Boundary walls, fences and gate in satisfactory condition", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Garden clear of rubbish and overgrowth", type: "DROPDOWN", options: YES_NO },
      { label: "Doorbell / intercom present and working", type: "DROPDOWN", options: YES_NO },
      { label: "Adequate number of bins for size of property", type: "DROPDOWN", options: YES_NO },
      { label: "Front of property comments", type: "TEXT" },
    ],
  },
  {
    title: "Front entrance and hallway",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Front door hardwood or uPVC and in satisfactory condition", type: "DROPDOWN", options: ["Yes — hardwood", "Yes — uPVC", "Not satisfactory"] },
      { label: "Yale latch and thumb-turn lock present", type: "DROPDOWN", options: YES_NO },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Interlinked smoke alarm", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Walls free from dampness", type: "DROPDOWN", options: YES_NO },
      { label: "Lighting adequate", type: "DROPDOWN", options: YES_NO },
      { label: "Type of floor covering", type: "DROPDOWN", options: FLOOR_COVERING },
      { label: "Floor covering clean and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "If a flat — fire door with 3 hinges, closer and strips, satisfactory?", type: "DROPDOWN", options: YES_NO },
      { label: "Front entrance and hallway comments", type: "TEXT" },
    ],
  },
  {
    title: "Central heating boiler, cylinder and insulation",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Type of heating", type: "DROPDOWN", options: ["Gas central heating", "Economy 7 heating", "Electric heating"] },
      { label: "Gas boiler less than 10 years old", type: "DROPDOWN", options: YES_NO },
      { label: "Carbon monoxide detector present", type: "DROPDOWN", options: YES_NO },
      { label: "Exposed pipes to boiler and low-level piping boxed in", type: "DROPDOWN", options: YES_NO },
      { label: "Thermostat present", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Heating operates independently from hot water", type: "DROPDOWN", options: YES_NO },
      { label: "Fuse box housed in cupboard with childproof latch, no exposed wiring", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Communal areas (flats only)",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Fire alarm panel in working order", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Emergency lighting satisfactory", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Communal areas free from belongings / rubbish", type: "DROPDOWN", options: YES_NO },
      { label: "Lighting adequate", type: "DROPDOWN", options: YES_NO },
      { label: "Interlinked smoke alarms", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Reception room 1",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Door in satisfactory condition and with no lock", type: "DROPDOWN", options: ["Yes", "No", "No door present"] },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Type of floor covering", type: "DROPDOWN", options: FLOOR_COVERING },
      { label: "Windows satisfactory with adequate ventilation", type: "DROPDOWN", options: YES_NO },
      { label: "Window restrictors fitted (opens no more than 100mm)", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "2 or more double sockets in satisfactory condition", type: "DROPDOWN", options: YES_NO },
      { label: "Light switches in satisfactory condition", type: "DROPDOWN", options: YES_NO },
      { label: "Curtains, nets or blinds in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "None present"] },
      { label: "Chairs, table and sofa provided and fire-safety compliant", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Reception room 2",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Door in satisfactory condition and with no lock", type: "DROPDOWN", options: ["Yes", "No", "No door present"] },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Type of floor covering", type: "DROPDOWN", options: FLOOR_COVERING },
      { label: "Windows satisfactory with adequate ventilation", type: "DROPDOWN", options: YES_NO },
      { label: "Window restrictors fitted (opens no more than 100mm)", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "2 or more double sockets in satisfactory condition", type: "DROPDOWN", options: YES_NO },
      { label: "Light switches in satisfactory condition", type: "DROPDOWN", options: YES_NO },
      { label: "Curtains, nets or blinds in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "None present"] },
      { label: "Chairs, table and sofa provided and fire-safety compliant", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Kitchen / diner",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Fire door satisfactory (lever & latch, 3 hinges, closer, strips)", type: "DROPDOWN", options: YES_NO },
      { label: "Fire blanket to BS EN 1869:1997", type: "DROPDOWN", options: YES_NO },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Windows satisfactory with adequate ventilation", type: "DROPDOWN", options: YES_NO },
      { label: "Window restrictors fitted (opens no more than 100mm)", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "2 double sockets at worktop height, 1 for washing machine, 1 for fridge", type: "DROPDOWN", options: YES_NO },
      { label: "Adequate extractor fan installed and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Flooring satisfactory", type: "DROPDOWN", options: ["Yes — vinyl", "Yes — tiles", "Yes — laminate", "Yes — carpet"] },
      { label: "Back door satisfactory", type: "DROPDOWN", options: ["Yes — hardwood", "Yes — uPVC", "No"] },
      { label: "Kitchen sink, taps and work surface satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Fridge / freezer", type: "DROPDOWN", options: ["Free standing", "Undercounter", "Built in"] },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Staircase and landing (house only)",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Spindles less than 100mm apart", type: "DROPDOWN", options: YES_NO },
      { label: "Handrail full length and satisfactory condition", type: "DROPDOWN", options: YES_NO },
      { label: "Staircase carpeted and level without trip hazard", type: "DROPDOWN", options: YES_NO },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Landing floor level", type: "DROPDOWN", options: YES_NO },
      { label: "Interlinked electric smoke alarm fitted to each landing", type: "DROPDOWN", options: YES_NO },
      { label: "Two-way light switch fitted, satisfactory and working", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Bathroom / toilet",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Door satisfactory with privacy latch", type: "DROPDOWN", options: YES_NO },
      { label: "Flooring satisfactory", type: "DROPDOWN", options: ["Yes — vinyl", "Yes — tiles", "Yes — laminate"] },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Windows satisfactory with adequate ventilation", type: "DROPDOWN", options: ["Yes", "No", "No window in bathroom"] },
      { label: "Window restrictors fitted (opens no more than 100mm)", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Light switch fitted, satisfactory and working", type: "DROPDOWN", options: YES_NO },
      { label: "Extractor fan working and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Bath and taps working and satisfactory", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Shower working and satisfactory", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Toilet working and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Washbasin and taps working and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
    ],
  },
  { title: "Bedroom 1", fields: bedroomBlock() },
  { title: "Bedroom 2", fields: bedroomBlock() },
  { title: "Bedroom 3", fields: bedroomBlock() },
  { title: "Bedroom 4", fields: bedroomBlock() },
  { title: "Bedroom 5", fields: bedroomBlock() },
  {
    title: "External rear of property",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Garden has washing line or rotary drier", type: "DROPDOWN", options: YES_NO },
      { label: "Side or rear gate fitted with lock", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Visual inspection of roof — satisfactory?", type: "DROPDOWN", options: YES_NO },
      { label: "Guttering secure and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Waste pipes secure and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Garden clear of rubbish and overgrowth", type: "DROPDOWN", options: YES_NO },
    ],
  },
  {
    title: "Maintenance issues",
    fields: [
      { label: "Tenant damage", type: "TEXT" },
      { label: "Wear and tear — report to landlord", type: "TEXT" },
    ],
  },
  {
    title: "Additional information",
    fields: [{ label: "Additional information", type: "TEXT" }],
  },
  complianceSection("Compliance — selective licence", [
    "Kitchen door meets fire-check spec (rated hinges, self-closer, intumescent strip, cold smoke seals, thumb-turn lock)",
    "Heat detector fitted in kitchen",
    "Smoke alarm fitted in hallway/landing of each floor",
    "No locks fitted to bedroom doors",
    "Licence displayed",
    "Bathroom extractor fan working",
    "Kitchen extractor fan working",
    "Fire blanket present in kitchen",
  ]),
  complianceSection("Compliance — Section 257 HMO", [
    "Meters and fuse boxes in common areas are fire-proofed",
    "Interlinked smoke alarms and heat detector fitted per flat sharing common areas",
    "Fire alarm panel installed (3+ storey buildings)",
    "Emergency lighting installed and working",
    "Each flat's front door meets fire-check spec",
    "Fire safety signage displayed throughout common areas",
    "Staircases with storage are fire-proofed",
    "Outside light fitted and working",
    "Common areas free of obstacles",
    "Entrance to main door is clear of trip hazards",
    "CO alarm present and working (if gas supply present)",
    "Bathroom extractor fan working",
    "Kitchen extractor fan working",
    "Licence displayed",
  ]),
  complianceSection("Compliance — additional HMO", [
    "Interlinked smoke alarms in hallways/landings/living room and heat detector in kitchen",
    "Kitchen door meets fire-check spec",
    "Fire blanket fitted in kitchen",
    "CO alarm present and working (if gas supply present)",
    "Bathroom extractor fan working",
    "Kitchen extractor fan working",
    "Licence displayed",
    "All bedrooms fitted with thumb-turn locks",
  ]),
  complianceSection("Compliance — mandatory HMO", [
    "Interlinked smoke alarms and heat detector fitted in each flat",
    "Fire alarm panel installed (3+ storey buildings)",
    "Emergency lighting installed and working",
    "Each flat's front door meets fire-check spec",
    "Fire safety signage displayed throughout common areas",
    "Staircases with storage are fire-proofed",
    "Fire blanket fitted in each flat",
    "CO alarm present and working (if gas supply present)",
    "All bathrooms have working extractor fans",
    "All kitchens have working extractor fans",
    "Licence displayed",
  ]),
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-temp-accommodation-inspection-template.js YOUR_COMPANY_ID");
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
      name: "Temporary Accommodation Inspection Report — House/Flat",
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
