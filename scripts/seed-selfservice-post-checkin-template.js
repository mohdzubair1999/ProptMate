// Creates the "Self-Service: Post Check-in Report (Tenant)" template.
// NOTE: this is a tenant-facing self-service form. The CLIENT role exists in the schema but
// there's no tenant portal built yet for them to actually access and fill this out — that's
// still a separate, unbuilt feature. The template content itself is seeded regardless, since
// it's reusable once that portal exists.
// Run with: node --env-file=.env scripts/seed-selfservice-post-checkin-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];

const sections = [
  {
    title: "About this form",
    fields: [
      {
        label: "About this form",
        type: "TERMS",
        options: "This self-service form lets you confirm the condition of utilities, keys, safety devices and paperwork shortly after moving in.",
      },
    ],
  },
  {
    title: "Utilities",
    fields: [
      { label: "Utilities", type: "GRID_SECTION", options: "Post check-in: utilities" },
      { label: "Additional comments (details of any issues with utilities)", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Deposit protection",
    fields: [
      { label: "Have you received confirmation your deposit is protected in a government-approved scheme?", type: "DROPDOWN", options: ["Yes", "No", "N/A — no deposit taken"] },
      { label: "Which scheme, if known?", type: "DROPDOWN", options: ["TDS", "Deposit Protection Service (DPS)", "mydeposits", "Not sure", "N/A"] },
      { label: "Additional comments", type: "TEXT" },
    ],
  },
  {
    title: "Keys",
    fields: [
      { label: "Have you experienced any issues with the keys provided at check-in?", type: "DROPDOWN", options: YES_NO },
      { label: "If yes, have you previously reported these issues?", type: "DROPDOWN", options: YES_NO },
      { label: "If no, please provide details", type: "TEXT" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Safety",
    fields: [
      {
        label: "Instructions",
        type: "INFO_TEXT",
        options:
          "Please locate the smoke detector on each floor, and the CO detector if gas appliances are present, and test each by pressing the test button until the alarm sounds.",
      },
      { label: "Safety devices", type: "GRID_SECTION", options: "Post check-in: safety" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Tenancy documents",
    fields: [
      {
        label: "Instructions",
        type: "INFO_TEXT",
        options: "Please confirm you received the following documentation prior to move-in.",
      },
      {
        label: "Gas safety certificate received?",
        type: "DROPDOWN",
        options: ["Yes — present at check-in", "Yes — by email prior to check-in", "No", "N/A, no gas at the property"],
      },
      {
        label: "Energy performance certificate received?",
        type: "DROPDOWN",
        options: ["Yes — present at check-in", "Yes — by email prior to check-in", "No"],
      },
      {
        label: "Electrical safety certificate received?",
        type: "DROPDOWN",
        options: ["Yes — present at check-in", "Yes — by email prior to check-in", "No"],
      },
      {
        label: "Portable appliance safety certificate received?",
        type: "DROPDOWN",
        options: ["Yes — present at check-in", "Yes — by email prior to check-in", "No", "N/A — no portable appliances included"],
      },
      {
        label: "Appliance manuals received?",
        type: "DROPDOWN",
        options: ["Yes — present at check-in", "Yes — by email prior to check-in", "No"],
      },
      {
        label: "Inventory received, reviewed and returned to agent?",
        type: "DROPDOWN",
        options: ["Yes", "No, not received", "Received, but not returned"],
      },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Check-in feedback",
    fields: [
      { label: "Room-specific feedback", type: "GRID_SECTION", options: "Post check-in: feedback" },
      { label: "Please confirm how you've been advised to report maintenance issues", type: "TEXT" },
      { label: "Do you have any initial maintenance issues to report?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "If yes, please provide full details", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "About the agent",
    fields: [
      { label: "How would you rate your overall moving experience? (1 low – 5 high)", type: "SCORE" },
      { label: "How would you rate your check-in experience? (1 low – 5 high)", type: "SCORE" },
      { label: "Comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Declaration",
    fields: [
      {
        label: "Declaration",
        type: "TERMS",
        options: "By submitting this form, you confirm the information provided is accurate to the best of your knowledge.",
      },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-selfservice-post-checkin-template.js YOUR_COMPANY_ID");
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
      name: "Self-Service: Post Check-in Report (Tenant)",
      inspectionType: "check-in",
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
