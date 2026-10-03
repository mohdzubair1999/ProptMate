// Creates the "Self-Service: Pre Check-out Report (Tenant)" template.
// NOTE: same tenant self-service caveat — CLIENT role exists, tenant portal access doesn't yet.
// Run with: node --env-file=.env scripts/seed-selfservice-pre-checkout-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];
const PRESENT_WORKING = ["Present and working", "Present but not working", "Not present"];
const PRESENT_WORKING_NA = [...PRESENT_WORKING, "N/A"];

function checklistItem(label) {
  return { label, type: "DROPDOWN", options: ["Yes", "No — see details below"] };
}
function checklistItemNA(label) {
  return { label, type: "DROPDOWN", options: ["Yes", "No — see details below", "N/A"] };
}

const sections = [
  {
    title: "Preparation — for office use only",
    fields: [
      { label: "Copy of inventory provided", type: "DATE" },
      { label: "Copy of TDS certificate and information provided", type: "DATE" },
      { label: "Copy of How to Rent guide(s) provided", type: "DATE" },
      { label: "Check-out date confirmed in writing", type: "DATE" },
      { label: "Check-out date", type: "DATE" },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "About this form",
    fields: [{ label: "About this form", type: "TERMS", options: "This form helps you prepare for your check-out and confirm the property's condition beforehand." }],
  },
  {
    title: "Safety",
    fields: [
      {
        label: "Smoke detector / CO detector",
        type: "INFO_TEXT",
        options: "Please locate the smoke detector on each floor and the CO detector (if gas appliances or wood/coal burners are present), and test each by pressing the test button until the alarm sounds.",
      },
      { label: "Ground floor smoke alarm present and working", type: "DROPDOWN", options: PRESENT_WORKING },
      { label: "Location", type: "TEXT" },
      { label: "First floor smoke alarm present and working", type: "DROPDOWN", options: PRESENT_WORKING_NA },
      { label: "Location", type: "SHORT_TEXT" },
      { label: "Second floor smoke alarm present and working", type: "DROPDOWN", options: PRESENT_WORKING_NA },
      { label: "Location", type: "SHORT_TEXT" },
      { label: "Carbon monoxide detector present", type: "DROPDOWN", options: PRESENT_WORKING_NA },
      { label: "Location", type: "SHORT_TEXT" },
      { label: "Is there a solid-fuel (wood/coal) appliance in the property?", type: "DROPDOWN", options: YES_NO },
      { label: "Details of solid-fuel appliance", type: "TEXT" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Maintenance",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "Please provide details of any maintenance issues in the property, including issues reported but not yet resolved." },
      { label: "Maintenance issues to be reported", type: "GRID_SECTION", options: "Tenant check-out report: maintenance" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Updates during tenancy",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "Please provide details of all improvements you've made to the property during your occupation." },
      { label: "Details of improvements", type: "GRID_SECTION", options: "Tenant check-out report: tenant improvements" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Deposit protection",
    fields: [
      { label: "Do you have confirmation your deposit was protected throughout your tenancy?", type: "DROPDOWN", options: ["Yes", "No", "N/A — no deposit taken"] },
      { label: "Additional comments", type: "TEXT" },
    ],
  },
  {
    title: "Keys",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "Please note ALL keys must be returned at check-out." },
      { label: "Have you made copies of any keys during your occupancy?", type: "DROPDOWN", options: YES_NO },
      { label: "If yes, please provide details", type: "TEXT" },
      { label: "Photos of all keys", type: "PHOTO" },
      { label: "Are there any meter keys?", type: "DROPDOWN", options: YES_NO },
      { label: "If yes, please provide details (photo)", type: "PHOTO" },
      { label: "If yes, will the meter keys be left in the property?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "You understand that the cost of any keys not returned will be deducted from your deposit", type: "DROPDOWN", options: YES_NO },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Check-out preparations",
    fields: [
      { label: "Do you wish to be present at the check-out?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      {
        label: "Check-out preparations",
        type: "INFO_TEXT",
        options: "Please confirm you have undertaken (or are due to undertake) the following, where appropriate, before check-out.",
      },
      checklistItem("Property left in good, clean condition throughout, all personal items removed?"),
      checklistItemNA("All items/furniture returned to the same position as listed on the inventory?"),
      checklistItem("All windows, mirrors and glass items cleaned and polished?"),
      checklistItem("All woodwork, skirting, rails, frames, shelving, cabinets cleaned and polished?"),
      checklistItem("All soft furnishings (carpets, curtains, rugs, bed linen, towels, throws, mattresses) laundered and clean?"),
      checklistItem("All walls and ceilings dusted, wiped where necessary, free of excessive wear?"),
      checklistItem("All kitchen appliances (cooker, hob, microwave, toaster, washer, dryer) cleaned and residue-free?"),
      checklistItem("All kitchen cupboards cleaned and emptied of your food and belongings?"),
      checklistItemNA("All fridges and freezers emptied, cleaned, defrosted, switched off, doors left open?"),
      { label: "Have all extractor fans been cleaned and filters changed?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      checklistItem("All bathrooms cleaned thoroughly, sealant and grouting free of staining or mould?"),
      checklistItem("All light bulbs present and working?"),
      checklistItemNA("All picture hooks, tacks, screws, nails or fittings you installed removed and damage made good?"),
      checklistItemNA("Garden(s) left well maintained for the time of year, lawns cut, tools cleaned and working?"),
      checklistItemNA("All missing or damaged items replaced to match?"),
      checklistItem("Mail forwarding service set up to ensure post reaches you at your new address?"),
      { label: "If you answered 'No' to any of the above, please add more details here", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Declaration",
    fields: [{ label: "Declaration", type: "TERMS", options: "By submitting this form, you confirm the information provided is accurate to the best of your knowledge." }],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-selfservice-pre-checkout-template.js YOUR_COMPANY_ID");
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
      name: "Self-Service: Pre Check-out Report (Tenant)",
      inspectionType: "check-out",
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
