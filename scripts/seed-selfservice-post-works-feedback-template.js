// Creates the "Self-Service: Post-Works Feedback (Tenant)" template.
// NOTE: same tenant self-service caveat as the Post Check-in template — the CLIENT role
// exists but there's no portal yet for a tenant to actually access and submit this.
// Run with: node --env-file=.env scripts/seed-selfservice-post-works-feedback-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const sections = [
  {
    title: "Preparation — for office use only",
    fields: [
      { label: "Details of the maintenance issue", type: "TEXT" },
      { label: "Date contractor instructed", type: "DATE" },
      { label: "Company instructed", type: "TEXT" },
      { label: "Invoice received", type: "DATE" },
    ],
  },
  {
    title: "About this form",
    fields: [
      { label: "About this form", type: "TERMS", options: "This form asks for your feedback on recent maintenance works carried out at your property." },
    ],
  },
  {
    title: "About the contractor",
    fields: [
      { label: "How did the contractor make initial contact with you?", type: "MULTIPLE_CHOICE", options: ["Email", "Phone", "Text", "Visit", "WhatsApp"] },
      { label: "Date of contractor visit", type: "DATE" },
      { label: "Name of contractor's representative", type: "TEXT" },
      { label: "Was ID provided by the contractor?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "How would you rate the contractor who visited? (1 low – 5 high)", type: "SCORE" },
      { label: "Has the issue (or issues) been fully resolved?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "Additional comments", type: "TEXT" },
      { label: "Please provide photo(s) of works undertaken", type: "PHOTO" },
    ],
  },
  {
    title: "About the agent",
    fields: [
      { label: "How did you report the maintenance issue to our office?", type: "TEXT" },
      { label: "Who contacted you from our office regarding this issue?", type: "TEXT" },
      { label: "How would you rate your experience with our office in relation to this issue? (1 low – 5 high)", type: "SCORE" },
      { label: "Additional comments", type: "TEXT" },
    ],
  },
  {
    title: "Declaration",
    fields: [
      { label: "Declaration", type: "TERMS", options: "By submitting this form, you confirm the feedback provided is accurate to the best of your knowledge." },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-selfservice-post-works-feedback-template.js YOUR_COMPANY_ID");
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
      name: "Self-Service: Post-Works Feedback (Tenant)",
      inspectionType: "maintenance",
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
