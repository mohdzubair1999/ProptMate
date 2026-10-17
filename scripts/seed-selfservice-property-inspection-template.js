// Creates the "Self-Service: Property Inspection Report (Tenant)" template.
// NOTE: same tenant self-service caveat as the other Self-Service templates.
// Run with: node --env-file=.env scripts/seed-selfservice-property-inspection-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];
const YES_NO_NA = ["Yes", "No", "N/A"];
const OVERVIEW_NOTE = "Please take at least TWO general photos of this area.";
const VISUAL_CHECK_NOTE =
  "Please complete a full visual check of this area and report back on your findings, including any maintenance issues not previously reported or reported but not yet rectified.";

function roomBlock() {
  return [
    { label: "Overview photo notes", type: "INFO_TEXT", options: OVERVIEW_NOTE },
    { label: "Overview photos", type: "PHOTO" },
    { label: "Visual check notes", type: "INFO_TEXT", options: VISUAL_CHECK_NOTE },
    { label: "Any areas of concern or maintenance to report?", type: "DROPDOWN", options: YES_NO },
    { label: "Any visible signs of damp or water leaks?", type: "DROPDOWN", options: YES_NO },
    { label: "Comments", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const rooms = [
  "Hall / entrance",
  "Reception room 1",
  "Reception room 2",
  "Cloakroom / WC",
  "Kitchen",
  "Utility room",
  "Stairs and landing",
  "Bedroom 1",
  "Ensuite",
  "Bedroom 2",
  "Ensuite 2",
  "Bedroom 3",
  "Bedroom 4",
  "Bedroom 5",
  "Bathroom",
];

const sections = [
  {
    title: "Introduction",
    fields: [{ label: "About this form", type: "TERMS", options: "This self-service form lets you carry out a walk-through of the property and report back on its condition." }],
  },
  {
    title: "Outside area(s)",
    fields: [
      { label: "Overview photo notes", type: "INFO_TEXT", options: OVERVIEW_NOTE },
      { label: "Overview photos", type: "PHOTO" },
      { label: "Visual check notes", type: "INFO_TEXT", options: "Please complete a full visual check of this area and report back on your findings." },
      { label: "Is the garden in seasonal order?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Any concerns with the fencing?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Is the shed/outbuildings in good order, roof intact?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Garage",
    fields: [
      { label: "Overview photo notes", type: "INFO_TEXT", options: OVERVIEW_NOTE },
      { label: "Overview photos", type: "PHOTO" },
      { label: "Visual check notes", type: "INFO_TEXT", options: "Please complete a full visual check of this area and report back on your findings." },
      { label: "Any areas of concern or maintenance to report?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Property exterior",
    fields: [
      { label: "Overview photo notes", type: "INFO_TEXT", options: OVERVIEW_NOTE },
      { label: "Overview photos", type: "PHOTO" },
      { label: "Visual check notes", type: "INFO_TEXT", options: VISUAL_CHECK_NOTE },
      { label: "Do the window frames appear in good order?", type: "DROPDOWN", options: YES_NO },
      { label: "If wooden, is the paint in good condition and not flaking?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Can you confirm the roof tiles are intact?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Have gutters been seen overflowing in heavy rain?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Do gutters appear clear of debris and leaves?", type: "DROPDOWN", options: ["Yes", "Unable to see", "No", "N/A"] },
      { label: "Do guttering downpipes appear defective in any way?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Are guttering drains clear of debris and leaves?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  ...rooms.map((title) => ({ title, fields: roomBlock() })),
  {
    title: "Safety",
    fields: [
      { label: "Visual check notes", type: "INFO_TEXT", options: "Please complete a full visual check of these items and report back on your findings, including any unreported or unresolved maintenance concerns." },
      { label: "Are all main door locks in working order?", type: "DROPDOWN", options: YES_NO },
      { label: "Door locks comments", type: "TEXT" },
      { label: "Door locks photos", type: "PHOTO" },
      {
        label: "Smoke/CO detector instructions",
        type: "INFO_TEXT",
        options: "Please locate the smoke detector on each floor and the CO detector (if gas or solid-fuel appliances are present), and test each by pressing the test button until the alarm sounds.",
      },
      { label: "Able to locate a smoke detector on every floor?", type: "DROPDOWN", options: YES_NO },
      { label: "Please state the location of each detector", type: "TEXT" },
      { label: "Able to test each smoke detector?", type: "DROPDOWN", options: ["Yes", "No, unable to test", "N/A"] },
      { label: "Smoke detector comments", type: "TEXT" },
      { label: "Smoke detector photos", type: "PHOTO" },
      { label: "Does the property have gas or solid-fuel appliances (fire, oven, etc.)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "If yes, please state the location of each CO detector", type: "TEXT" },
      { label: "Able to test the CO detector?", type: "DROPDOWN", options: ["Yes", "No, unable to test", "N/A"] },
      { label: "CO detector comments", type: "TEXT" },
      { label: "CO detector photos", type: "PHOTO" },
    ],
  },
  {
    title: "Additional information",
    fields: [
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Follow-up (if issues/repairs identified)",
    fields: [
      { label: "Given the correct notice, are you agreeable to a contractor visiting?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "If yes, do you have any preferred dates/times?", type: "TEXT" },
      { label: "If no, what is the reason?", type: "TEXT" },
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
    console.error("Usage: node --env-file=.env scripts/seed-selfservice-property-inspection-template.js YOUR_COMPANY_ID");
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
      name: "Self-Service: Property Inspection Report (Tenant)",
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
