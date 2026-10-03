// Creates the "Check-in Summary" template.
// Run with: node --env-file=.env scripts/seed-checkin-summary-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO_NA = ["Yes", "No", "N/A"];

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
      { label: "Electric meter location", type: "SHORT_TEXT" },
      { label: "Electric meter reading", type: "NUMBER" },
      { label: "Electric meter serial number", type: "SHORT_TEXT" },
      { label: "Gas meter location", type: "SHORT_TEXT" },
      { label: "Gas meter reading", type: "NUMBER" },
      { label: "Gas meter serial number", type: "SHORT_TEXT" },
      { label: "Meter photos", type: "PHOTO" },
    ],
  },
  {
    title: "Meter readings — water and oil",
    fields: [
      { label: "Water meter location", type: "SHORT_TEXT" },
      { label: "Water meter reading", type: "NUMBER" },
      { label: "Water meter serial number", type: "SHORT_TEXT" },
      { label: "Oil meter location", type: "SHORT_TEXT" },
      { label: "Oil meter reading", type: "SHORT_TEXT" },
      { label: "Meter photos", type: "PHOTO" },
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
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Keys",
    fields: [
      { label: "Keys noted", type: "INFO_TEXT", options: "List all keys being handed over (quantity, key type and location)." },
      { label: "Keys handed over to tenant(s)", type: "TEXT" },
      { label: "Keys photo", type: "PHOTO" },
    ],
  },
  {
    title: "Safety",
    fields: [
      { label: "Smoke alarms present", type: "DROPDOWN", options: YES_NO_NA },
      { label: "All smoke alarms tested and working", type: "DROPDOWN", options: ["Yes — all tested and working", "No — unable to test", "N/A"] },
      { label: "CO detector present", type: "DROPDOWN", options: YES_NO_NA },
      { label: "CO detector tested and working", type: "DROPDOWN", options: ["Yes", "No — unable to test", "N/A"] },
    ],
  },
  {
    title: "Services",
    fields: [
      { label: "Gas on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Electric on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Water on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Heating on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Boiler on", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Immersion on", type: "DROPDOWN", options: YES_NO_NA },
    ],
  },
  {
    title: "Documents provided to tenants",
    fields: [
      { label: "Gas safety certificate", type: "DROPDOWN", options: ["Yes — present at check-in", "No — not present", "N/A"] },
      { label: "Energy performance certificate", type: "DROPDOWN", options: ["Yes — present at check-in", "No — not present", "N/A"] },
      { label: "Electrical safety certificate", type: "DROPDOWN", options: ["Yes — present at check-in", "No — not present", "N/A"] },
      { label: "Portable appliance safety certificate", type: "DROPDOWN", options: ["Yes — present at check-in", "No — not present", "N/A"] },
      { label: "Appliance manuals", type: "DROPDOWN", options: ["Yes — present at check-in", "No — not present", "N/A"] },
      { label: "Inventory checked and signed by tenant(s)", type: "DROPDOWN", options: YES_NO_NA },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Schedule of condition",
    fields: [...scheduleOfCondition, { label: "Check-in comments", type: "TEXT" }, { label: "Photos", type: "PHOTO" }, { label: "— Page break —", type: "PAGE_BREAK" }],
  },
  {
    title: "Comments",
    fields: [
      { label: "Follow-up", type: "TEXT" },
      { label: "Follow-up photos", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Terms and conditions",
    fields: [{ label: "Disclaimer", type: "TERMS", options: "This check-in report reflects the property's condition at the start of the tenancy." }],
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
    console.error("Usage: node --env-file=.env scripts/seed-checkin-summary-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Check-in Summary", inspectionType: "check-in", propertyType: null },
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
