// Creates the "Check-out (standalone) — Schedule of condition with basic rooms" template.
// GRID_SECTION fields are display-only markers — real cross-report (check-in vs check-out)
// comparison is a separate, not-yet-built feature.
// Run with: node --env-file=.env scripts/seed-checkout-standalone-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO_NA = ["Yes", "No", "N/A"];

function roomBlock() {
  return [
    { label: "Comments", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const rooms = [
  "Exterior front",
  "Entrance hall",
  "Living room",
  "Dining room",
  "Kitchen",
  "Utility room",
  "Spare room",
  "Stairs and landing",
  "Bathroom",
  "Bedroom 1",
  "Bedroom 1 ensuite",
  "Bedroom 2",
  "Bedroom 2 ensuite",
  "Bedroom 3",
  "Bedroom 4",
  "Bedroom 5",
  "Bedroom 6",
  "Spare room 2",
  "Exterior rear",
];

const scheduleOfCondition = [
  { label: "Grass / lawns", type: "DROPDOWN", options: ["Recently cut", "Slightly overlong", "Overlong", "N/A"] },
  { label: "Garden / grounds", type: "DROPDOWN", options: ["Well maintained", "Additional attention required", "Untidy", "N/A"] },
  { label: "Exterior windows", type: "DROPDOWN", options: ["Recently cleaned", "Reasonable", "Below standard"] },
  { label: "Interior windows", type: "DROPDOWN", options: ["Recently cleaned", "Reasonable", "Below standard"] },
  { label: "Carpets / flooring", type: "DROPDOWN", options: ["New", "Professionally cleaned", "Domestically cleaned", "Not cleaned", "Marked or scratched", "N/A"] },
  { label: "Decor", type: "DROPDOWN", options: ["Newly decorated", "Minor wear and tear", "Average wear", "Basic condition"] },
  { label: "Kitchen", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard"] },
  { label: "Oven", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard", "N/A"] },
  { label: "Kitchen appliances", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard", "N/A"] },
  { label: "Light fittings", type: "DROPDOWN", options: ["All working", "Mostly working", "Bulbs missing", "None working"] },
  { label: "Mould and mildew", type: "DROPDOWN", options: ["None visible", "Slight, as noted", "Heavy, as noted"] },
  { label: "Bathroom(s) and sanitaryware", type: "DROPDOWN", options: ["Professional standard", "Generally good", "Reasonable", "Below standard"] },
  { label: "Overall cleanliness", type: "DROPDOWN", options: ["Professionally cleaned", "Domestically cleaned", "Attention required"] },
];

const sections = [
  {
    title: "Meter readings — electric and gas",
    fields: [
      { label: "Comparison with check-in readings", type: "GRID_SECTION", options: "Meter readings" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Keys",
    fields: [
      { label: "Keys comparison", type: "GRID_SECTION", options: "Keys" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Deposit protection",
    fields: [
      { label: "Was the deposit protected in a government-approved scheme throughout the tenancy?", type: "DROPDOWN", options: ["Yes", "No", "N/A — no deposit taken"] },
      { label: "Scheme used", type: "DROPDOWN", options: ["TDS", "Deposit Protection Service (DPS)", "mydeposits", "N/A"] },
      { label: "Deposit certificate / reference number", type: "SHORT_TEXT" },
      { label: "Any proposed deductions discussed with tenant(s)?", type: "DROPDOWN", options: ["Yes", "No", "N/A — no deductions proposed"] },
      { label: "Comments", type: "TEXT" },
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
      { label: "Smoke alarm(s) present and working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "CO detector present and working (if applicable)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire extinguisher / blanket present (if applicable)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Safety devices comparison with check-in", type: "GRID_SECTION", options: "Safety devices" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Checklist — services",
    fields: [
      { label: "Gas on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Electric on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Heating on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Boiler on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Immersion on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Schedule of condition",
    fields: [...scheduleOfCondition, { label: "Check-out comments", type: "TEXT" }, { label: "Photos", type: "PHOTO" }, { label: "— Page break —", type: "PAGE_BREAK" }],
  },
  ...rooms.map((title) => ({ title, fields: roomBlock() })),
  {
    title: "Advisory comments",
    fields: [
      { label: "Follow-up advice summary", type: "GRID_SECTION", options: "Follow-up advice summary" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Terms and conditions",
    fields: [
      {
        label: "Disclaimer",
        type: "TERMS",
        options: "This check-out report reflects the property's condition at the time of inspection, for comparison against the check-in report where available.",
      },
    ],
  },
  {
    title: "Declaration",
    fields: [
      { label: "Tenant(s) signature", type: "SIGNATURE" },
      { label: "Agent signature", type: "SIGNATURE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-checkout-standalone-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Check-out (standalone) — Schedule of condition", inspectionType: "check-out", propertyType: null },
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
