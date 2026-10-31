// Creates the "Completion statement of works" template.
// NOTE: source used a merge-field ({{ Property - Address }}) to auto-fill the address.
// Real merge-field auto-fill isn't built yet — this seeds as a plain text field for now.
// Run with: node --env-file=.env scripts/seed-completion-statement-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const sections = [
  {
    title: "General information",
    fields: [
      { label: "Client", type: "SHORT_TEXT" },
      { label: "Client logo", type: "PHOTO" },
      { label: "Property address", type: "SHORT_TEXT" },
      { label: "Job number / reference", type: "SHORT_TEXT" },
      { label: "Contractor name", type: "SHORT_TEXT" },
    ],
  },
  {
    title: "Job details",
    fields: [
      { label: "Job outcome", type: "DROPDOWN", options: ["Requested works fully completed", "Requested works partially completed", "Unable to carry out the requested works"] },
      { label: "Works instructed and completed", type: "TEXT" },
      { label: "Were there any variations to the original instruction?", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "If yes, please detail", type: "TEXT" },
    ],
  },
  { title: "Before photos", fields: [{ label: "Photos of the area/issue prior to works", type: "PHOTO" }] },
  { title: "After photos", fields: [{ label: "Photos of completed works", type: "PHOTO" }] },
  {
    title: "Completion checklist",
    fields: [
      { label: "All works completed in line with agreed scope", type: "DROPDOWN", options: ["Yes", "No — see above for details"] },
      { label: "Work completed to a professional standard", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "Work area cleared of materials, debris and waste", type: "DROPDOWN", options: ["Yes", "No"] },
      { label: "Variations discussed with client prior to completion", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Contractor warranties confirmed where applicable", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Manufacturer warranties noted separately", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Additional comments (if required)", type: "TEXT" },
    ],
  },
  {
    title: "Follow-up works and recommendations",
    fields: [
      { label: "Follow-up works", type: "DROPDOWN", options: ["None required", "Recommended — see below"] },
      { label: "Details of follow-up works recommended", type: "GRID_SECTION", options: "Works recommended" },
    ],
  },
  {
    title: "Completion statement",
    fields: [
      { label: "Contractor declaration", type: "TERMS", options: "I confirm the works described above were carried out and completed as detailed in this report." },
      { label: "Contractor signature", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
  {
    title: "Sign-off (if onsite at time of completion)",
    fields: [
      { label: "Acknowledgement", type: "TERMS", options: "I acknowledge that the above works have been completed to my satisfaction." },
      { label: "Sign-off provided by", type: "DROPDOWN", options: ["Client", "Tenant", "Occupier", "Agent / representative", "Colleague"] },
      { label: "Signature", type: "SIGNATURE" },
      { label: "Name", type: "SHORT_TEXT" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-completion-statement-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Completion statement of works", inspectionType: "maintenance", propertyType: null },
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
