// Creates the "Commercial site inspection checklist" template.
// Run with: node --env-file=.env scripts/seed-commercial-site-checklist-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO_NA = ["Yes", "No", "N/A"];
const YES_NONE_SEEN = ["Yes", "None seen"];

const dampFields = [
  "Evidence of condensation damp (moisture on windows or walls)",
  "Evidence of penetrating damp (water ingress from roof, walls or gutters)",
  "Evidence of rising damp (ground-floor walls)",
  "Evidence of traumatic damp (leaks from pipes, plumbing or roof)",
  "Visible mould growth",
  "Musty or mould odour",
  "Ventilation condition (fans, air bricks, vents)",
  "Heating system maintains reasonable temperature",
  "Roof condition (holes, missing tiles, damaged flashing)",
  "Gutters and downpipes clear and functioning",
  "Water damage on ceilings, walls or floors",
  "Damp-proof course / membrane condition",
].map((label) => ({ label, type: "DROPDOWN", options: YES_NONE_SEEN }));

const healthSafetyFields = [
  "Gas safety certificate up to date",
  "EICR valid (5-year check)",
  "PAT testing completed for landlord-provided appliances",
  "Smoke alarms on every storey, present and functioning",
  "CO alarms present where solid-fuel/gas appliances exist",
  "Fire extinguishers and blankets present and serviced",
  "Fire escape routes clear and accessible",
  "Fire doors functioning, closers working",
  "Heating and hot water systems functioning",
  "Ventilation adequate",
  "Lighting adequate, including emergency lighting",
  "Drinking water supply safe and accessible",
  "Sanitary facilities functioning and clean",
  "Structure — floors, walls, ceilings safe",
  "Stairs and handrails secure, no trip hazards",
  "Asbestos survey and management plan in place (if applicable)",
  "Legionella risk assessment completed (if applicable)",
  "Property can maintain a reasonable temperature",
  "No evidence of pest infestation",
  "Gas appliances functioning safely",
  "Electrical wiring safe — no exposed wiring or overloaded sockets",
  "Adequate space and ventilation for occupants",
].map((label) => ({ label, type: "DROPDOWN", options: YES_NO_NA }));

const securityFields = [
  "Perimeter fencing / walls in good repair",
  "Gates secure with working locks",
  "Planting trimmed, clear sightlines",
  "Access control system functioning",
  "External doors secure and in good condition",
  "Windows secure with working locks",
  "Roller shutters and automatic doors working",
  "Security lighting adequate",
  "Car park and yard lighting adequate",
  "CCTV cameras installed and functioning",
  "Intruder alarm system installed and working",
  "Fire alarm system installed and functioning",
  "Motion detectors functioning (if installed)",
  "Temperature/humidity alarms functioning (if installed)",
  "Water/flooding alarms functioning (if installed)",
  "Panic button alarms available (if applicable)",
  "Keys inventory up to date",
  "Restricted access areas locked and secure",
  "Roof access secure",
  "Signage — CCTV, trespassing, alarm warnings displayed",
  "Valuable contents stored securely with an inventory",
  "No evidence of forced entry or vandalism",
].map((label) => ({ label, type: "DROPDOWN", options: YES_NO_NA }));

const sections = [
  {
    title: "General information",
    fields: [
      { label: "Property address", type: "SHORT_TEXT" },
      { label: "Client", type: "SHORT_TEXT" },
      { label: "Client logo", type: "PHOTO" },
      { label: "Inspector name", type: "SHORT_TEXT" },
      { label: "Further details (if required)", type: "TEXT" },
    ],
  },
  { title: "Damp and mould", fields: [...dampFields, { label: "Other observations", type: "TEXT" }, { label: "Photos", type: "PHOTO" }] },
  { title: "Health and safety", fields: [...healthSafetyFields, { label: "Other observations", type: "TEXT" }, { label: "Photos", type: "PHOTO" }] },
  { title: "Security", fields: [...securityFields, { label: "Other observations", type: "TEXT" }, { label: "Photos", type: "PHOTO" }] },
  { title: "Summary", fields: [{ label: "Inspector overview", type: "TEXT" }, { label: "Additional photos", type: "PHOTO" }] },
  {
    title: "Inspector sign-off",
    fields: [
      { label: "Declaration", type: "TERMS", options: "By signing below, the inspector confirms this report reflects an accurate record of the site visit." },
      { label: "Inspector signature", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
      { label: "Review and sign-off", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-commercial-site-checklist-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Commercial site inspection checklist", inspectionType: "hmo", propertyType: "commercial" },
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
