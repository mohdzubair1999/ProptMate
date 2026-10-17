// Creates the "Mid Term: General (incl. Awaab's Law and Renters' Reform Bill)" template.
// Run with: node --env-file=.env scripts/seed-midterm-general-awaabs-rrb-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];
const YES_NO_NA = ["Yes", "No", "N/A"];
const GRID_GUIDANCE = "Log each area separately by tapping the plus symbol and filling out the details, then save. Alternatively, add detail in the comments below.";

const sections = [
  {
    title: "About this report",
    fields: [
      {
        label: "Our approach",
        type: "TERMS",
        options: "This inspection covers property condition, the health and safety duties introduced under Awaab's Law, and pet-related provisions under the Renters' Reform Bill.",
      },
    ],
  },
  {
    title: "Inspection details",
    fields: [
      { label: "Tenant(s) present?", type: "DROPDOWN", options: YES_NO },
      { label: "Weather conditions", type: "DROPDOWN", options: ["Dry", "Wet", "Snow and ice", "Windy", "N/A"] },
      { label: "Compiled on behalf of", type: "SHORT_TEXT" },
      { label: "Client logo", type: "PHOTO" },
      {
        label: "Reason for inspection",
        type: "DROPDOWN",
        options: ["Tenant-raised concern", "Concern flagged during a prior visit", "Routine inspection", "Other"],
      },
      { label: "If other, please detail", type: "TEXT" },
    ],
  },
  {
    title: "General property summary",
    fields: [
      {
        label: "General standard of cleanliness",
        type: "DROPDOWN",
        options: ["Good", "Fair — consistent with normal living", "Average — some attention advised", "Poor — improvement required"],
      },
      { label: "Cleanliness items noted", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
      { label: "Deviations from tenancy terms observed?", type: "DROPDOWN", options: YES_NO },
      { label: "Deviations noted", type: "TEXT" },
    ],
  },
  {
    title: "Health & safety — damp and mould",
    fields: [
      { label: "Any signs of damp or mould?", type: "DROPDOWN", options: YES_NO },
      { label: "Inspector guidance", type: "INFO_TEXT", options: GRID_GUIDANCE },
      { label: "If yes, please provide details", type: "GRID_SECTION", options: "Damp & mould — severity" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety — ventilation",
    fields: [
      { label: "Windows openable and in working order?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Trickle vents fitted and operational?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Mechanical ventilation operational (where required)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Extractor vents clean and unobstructed?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Signs of condensation?", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety — fire safety",
    fields: [
      { label: "Smoke alarms fitted?", type: "DROPDOWN", options: ["Mains-wired", "Battery", "Mixed mains and battery", "No"] },
      { label: "Smoke alarms tested?", type: "MULTIPLE_CHOICE", options: ["Confirmed working, light visible", "Confirmed working, sound heard", "Couldn't reach", "Battery missing/flat"] },
      { label: "CO detectors present?", type: "DROPDOWN", options: ["Yes", "No, but gas appliances present", "Not required — no gas appliances"] },
      { label: "Clear means of escape?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire doors where required?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire blanket present in kitchen?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "For HMOs only — emergency lighting operational?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Last known Fire Risk Assessment date", type: "SHORT_TEXT" },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Pets (Renters' Reform Bill)",
    fields: [
      { label: "Permission granted for pets?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Pets present?", type: "DROPDOWN", options: ["Yes", "No", "None observed"] },
      { label: "Evidence of pet-related damage?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Inspector guidance", type: "INFO_TEXT", options: GRID_GUIDANCE },
      { label: "If yes, please provide details", type: "GRID_SECTION", options: "Pets — damage" },
      { label: "Any concerns regarding pet management?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Condition — carpets, flooring, decor, exterior",
    fields: [
      { label: "Carpet condition", type: "DROPDOWN", options: ["Good", "Fair — normal wear", "Average — needs cleaning soon", "Poor — clean without delay"] },
      { label: "Hard flooring condition", type: "DROPDOWN", options: ["Good", "Fair — normal wear", "Average — more care advised", "Poor — immediate tenant action required"] },
      { label: "Interior decor condition", type: "DROPDOWN", options: ["Good", "Fair — normal wear", "Average — heavy wear, more care advised", "Poor — immediate tenant action required"] },
      { label: "Garden / yard condition", type: "DROPDOWN", options: ["Good", "Fair — seasonal, reasonable order", "Average — some attention advised", "Poor — immediate tenant action required"] },
      { label: "Exterior decor condition", type: "DROPDOWN", options: ["Good", "Fair — normal weathering", "Average — attention may be needed soon", "Poor — immediate attention advised"] },
      { label: "Items noted", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Additional findings",
    fields: [
      { label: "Signs of leaks", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of smoking", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of unauthorised occupancy", type: "DROPDOWN", options: YES_NO },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Resident engagement",
    fields: [
      { label: "Resident advised on ventilation and moisture management?", type: "DROPDOWN", options: ["Yes", "No", "Not present at inspection"] },
      { label: "Resident acknowledged report contents?", type: "DROPDOWN", options: ["Yes", "No", "Not present at inspection"] },
      { label: "Concerns raised by resident", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Inspector declaration",
    fields: [
      { label: "Inspector confirms awareness of Awaab's Law and current damp/mould reporting protocols", type: "DROPDOWN", options: YES_NO },
      { label: "Property free from Category 1 hazards, to the best of assessment?", type: "DROPDOWN", options: YES_NO },
      { label: "Inspector signature", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-midterm-general-awaabs-rrb-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Mid Term: General (incl. Awaab's Law and RRB)", inspectionType: "mid-term", propertyType: null },
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
