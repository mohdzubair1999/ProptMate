// Creates the "Temporary Accommodation Inspection Report — Studio" template.
// Run with: node --env-file=.env scripts/seed-temp-accommodation-studio-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];
const YES_NO_NA = ["Yes", "No", "N/A"];
const FLOOR_COVERING = ["Carpet with underlay", "Vinyl", "Laminate"];

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
    ],
  },
  {
    title: "Reapit details",
    fields: [
      { label: "Images on Reapit", type: "DROPDOWN", options: YES_NO },
      { label: "Descriptions on Reapit", type: "DROPDOWN", options: YES_NO },
    ],
  },
  {
    title: "Property type",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Studio", type: "INFO_TEXT", options: "This property is a studio — one main living space combining sleeping, kitchen, and living areas." },
      { label: "Type of property", type: "DROPDOWN", options: ["Conversion", "Purpose built"] },
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
    title: "Communal front entrance and hallway",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Front door hardwood or uPVC and in satisfactory condition", type: "DROPDOWN", options: ["Yes — hardwood", "Yes — uPVC", "Not satisfactory"] },
      { label: "Yale latch and thumb-turn lock present", type: "DROPDOWN", options: YES_NO },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Walls free from dampness", type: "DROPDOWN", options: YES_NO },
      { label: "Lighting adequate", type: "DROPDOWN", options: YES_NO },
      { label: "Type of floor covering", type: "DROPDOWN", options: FLOOR_COVERING },
      { label: "Floor covering clean and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Emergency lighting satisfactory", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire alarm panel in working order", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Or interlinked electric smoke alarm", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire extinguishers", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Communal areas free from belongings / rubbish", type: "DROPDOWN", options: YES_NO },
      { label: "Front entrance and hallway comments", type: "TEXT" },
    ],
  },
  {
    title: "Studio room",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Fire door satisfactory (lever & latch, 3 hinges, closer, strips)", type: "DROPDOWN", options: YES_NO },
      { label: "Yale latch and thumb-turn lock present and working", type: "DROPDOWN", options: YES_NO },
      { label: "Decoration (ceilings, walls, woodwork) satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Type of floor covering", type: "DROPDOWN", options: FLOOR_COVERING },
      { label: "Floor covering clean and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Windows satisfactory with adequate ventilation", type: "DROPDOWN", options: YES_NO },
      { label: "Window restrictors fitted (opens no more than 100mm)", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Light switches in satisfactory condition", type: "DROPDOWN", options: YES_NO },
      { label: "Curtains, nets or blinds in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "None present"] },
      { label: "Chairs, table and sofa provided and fire-safety compliant", type: "DROPDOWN", options: YES_NO },
      { label: "Fire blanket to BS EN 1869:1997 fitted", type: "DROPDOWN", options: YES_NO },
      { label: "Interlinked smoke alarm", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Carbon monoxide detector fitted", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Heat detector", type: "DROPDOWN", options: YES_NO_NA },
      { label: "2 double sockets at worktop height, 1 for washing machine, 1 for fridge", type: "DROPDOWN", options: YES_NO },
      { label: "Adequate extractor fan installed and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Back door satisfactory", type: "DROPDOWN", options: ["Hardwood", "uPVC", "N/A"] },
      { label: "Kitchen sink, taps and work surface satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Fridge / freezer", type: "DROPDOWN", options: ["Free standing", "Undercounter", "Built in"] },
      { label: "Bed in satisfactory condition", type: "DROPDOWN", options: ["Yes — double", "Yes — single", "Not satisfactory — double"] },
      { label: "Chest of drawers in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "Not present"] },
      { label: "Wardrobe in satisfactory condition", type: "DROPDOWN", options: ["Yes", "No", "Not present"] },
      { label: "Studio room comments", type: "TEXT" },
    ],
  },
  {
    title: "Bathroom / toilet",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Door satisfactory with privacy latch", type: "DROPDOWN", options: YES_NO },
      { label: "Flooring satisfactory", type: "DROPDOWN", options: ["Yes — vinyl", "Yes — tiles", "Yes — laminate", "Yes — carpet"] },
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
  {
    title: "Central heating boiler, cylinder and insulation",
    fields: [
      { label: "Gas boiler less than 10 years old", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Exposed pipes to boiler and low-level piping boxed in", type: "DROPDOWN", options: YES_NO },
      { label: "Thermostat present", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Heating operates independently from hot water", type: "DROPDOWN", options: YES_NO },
      { label: "Fuse box housed in cupboard with childproof latch, no exposed wiring", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "External rear of property",
    fields: [
      { label: "Photo", type: "PHOTO" },
      { label: "Garden has washing line or rotary drier", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Side or rear gate fitted with lock", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Visual inspection of roof — satisfactory?", type: "DROPDOWN", options: YES_NO },
      { label: "Guttering secure and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Waste pipes secure and satisfactory", type: "DROPDOWN", options: YES_NO },
      { label: "Garden clear of rubbish and overgrowth", type: "DROPDOWN", options: YES_NO },
      { label: "Fencing secure and in good order", type: "DROPDOWN", options: YES_NO_NA },
      { label: "External rear of property comments", type: "TEXT" },
    ],
  },
  {
    title: "Maintenance issues",
    fields: [
      { label: "Tenant damage", type: "TEXT" },
      { label: "Wear and tear — report to landlord", type: "TEXT" },
    ],
  },
  complianceSection("Compliance — selective licence", [
    "Kitchen door meets fire-check spec (rated hinges, self-closer, intumescent strip, cold smoke seals, thumb-turn lock)",
    "Heat detector fitted in kitchen",
    "Smoke alarm fitted in hallway/landing of each floor",
    "No locks fitted to bedroom doors",
    "Licence displayed",
    "Bathroom has extractor fan",
    "Kitchen has working extractor fan",
    "Fire blanket in kitchen",
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
    console.error("Usage: node --env-file=.env scripts/seed-temp-accommodation-studio-template.js YOUR_COMPANY_ID");
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
      name: "Temporary Accommodation Inspection Report — Studio",
      inspectionType: "mid-term",
      propertyType: "studio",
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
