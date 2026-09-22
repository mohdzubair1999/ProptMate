// Creates the "ProptMate Mid-Term Inspection — Full Standard" template.
// This is a from-scratch redesign, not a reworded copy: our own rating scales
// (Room Condition tiers, Hazard Severity tiers), and a consolidated licence
// compliance section instead of four near-duplicate blocks.
// Run with: node --env-file=.env scripts/seed-proptmate-midterm-standard-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ── Our own rating scales ───────────────────────────────────────────────
const ROOM_CONDITION = [
  "Move-in ready — no issues identified",
  "Minor attention — cosmetic only, no action needed now",
  "Needs action — schedule follow-up",
  "Priority repair — address as soon as possible",
];

const HAZARD_SEVERITY = [
  "No concern",
  "Monitor — recheck at next visit",
  "Address within 28 days",
  "Urgent — address within 7 days",
];

const YES_NO = ["Yes", "No"];
const YES_NO_NA = ["Yes", "No", "N/A"];

function roomBlock() {
  return [
    { label: "Room condition rating", type: "DROPDOWN", options: ROOM_CONDITION },
    { label: "What did you observe?", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const rooms = [
  "Hall / entrance",
  "Living room",
  "Kitchen",
  "Bathroom",
  "Bedroom 1",
  "Bedroom 2",
  "Bedroom 3",
  "Spare room (if applicable)",
];

const sections = [
  {
    title: "About this inspection",
    fields: [
      {
        label: "Our approach",
        type: "TERMS",
        options:
          "This inspection follows the ProptMate Condition & Compliance Standard: a room-by-room condition rating, a structured review of the health and safety duties introduced under Awaab's Law, and a consolidated licence compliance check.",
      },
      { label: "Tenant(s) present at inspection?", type: "DROPDOWN", options: YES_NO },
      { label: "Weather conditions", type: "DROPDOWN", options: ["Dry", "Wet", "Snow / ice", "Windy", "N/A"] },
      {
        label: "Reason for this visit",
        type: "DROPDOWN",
        options: ["Routine inspection", "Tenant-raised concern", "Concern flagged during a prior visit", "Other"],
      },
      { label: "If other, please detail", type: "TEXT" },
    ],
  },
  {
    title: "Room-by-room condition",
    fields: [
      {
        label: "How this section works",
        type: "INFO_TEXT",
        options: "Each room gets a single condition rating on our four-tier scale, plus a short note and photo where relevant — no separate cleanliness/decor scoring.",
      },
    ],
  },
  ...rooms.map((room) => ({ title: room, fields: roomBlock() })),
  {
    title: "Health & safety review — damp and mould",
    fields: [
      { label: "Any signs of damp or mould observed?", type: "DROPDOWN", options: YES_NO },
      { label: "Severity", type: "DROPDOWN", options: HAZARD_SEVERITY },
      { label: "Location(s) and extent", type: "TEXT" },
      { label: "Likely cause, if identifiable", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety review — ventilation",
    fields: [
      { label: "Windows open and close properly?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Trickle vents fitted and clear?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Extractor fans (kitchen/bathroom) working and unobstructed?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Any condensation observed?", type: "DROPDOWN", options: YES_NO },
      { label: "Severity", type: "DROPDOWN", options: HAZARD_SEVERITY },
      { label: "Notes", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Health & safety review — fire safety",
    fields: [
      { label: "Smoke alarm type", type: "DROPDOWN", options: ["Mains-wired", "Battery", "Mixed mains and battery", "None found"] },
      { label: "Smoke alarms tested and working?", type: "DROPDOWN", options: ["Yes, confirmed working", "No — couldn't reach", "No — battery missing/flat"] },
      { label: "CO alarm present where required?", type: "DROPDOWN", options: ["Yes", "No, but gas appliances present", "Not applicable — no gas appliances"] },
      { label: "Escape route clear?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire doors in place where required?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire blanket in kitchen?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Last fire risk assessment date (if known)", type: "SHORT_TEXT" },
      { label: "Severity of any issue found", type: "DROPDOWN", options: HAZARD_SEVERITY },
      { label: "Notes", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Licence & compliance — core checklist",
    fields: [
      {
        label: "About this section",
        type: "INFO_TEXT",
        options:
          "These checks apply regardless of licence type. If the property holds an HMO licence, complete the relevant addendum below as well.",
      },
      { label: "Kitchen door meets fire-check spec (rated hinges, self-closer, seals, thumb-turn lock)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Bathroom extractor fan working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Kitchen extractor fan working?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Licence displayed (if applicable)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Emergency lighting operational (if required)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Common areas clear of obstructions?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Licence & compliance — HMO addendum",
    fields: [
      {
        label: "Which licence type applies?",
        type: "DROPDOWN",
        options: ["None — not an HMO", "Selective licence", "Additional HMO licence", "Mandatory HMO licence", "Section 257 HMO"],
      },
      { label: "Interlinked smoke alarms and heat detector fitted per flat/unit?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "No locks fitted to bedroom doors (where required)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Staircases with storage are fire-proofed?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Meters and fuse boxes in fire-proofed enclosures (shared buildings)?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Fire safety signage displayed throughout common areas?", type: "DROPDOWN", options: YES_NO_NA },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Additional findings",
    fields: [
      { label: "Evidence of pets", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of smoking", type: "DROPDOWN", options: YES_NO },
      { label: "Evidence of unauthorised occupancy", type: "DROPDOWN", options: YES_NO },
      { label: "Anything else worth noting", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Resident engagement",
    fields: [
      { label: "Resident advised on ventilation and condensation management?", type: "DROPDOWN", options: ["Yes", "No", "Not present at inspection"] },
      { label: "Resident acknowledged the findings of this visit?", type: "DROPDOWN", options: ["Yes", "No", "Not present at inspection"] },
      { label: "Any concerns the resident raised", type: "TEXT" },
    ],
  },
  {
    title: "Overall summary",
    fields: [
      {
        label: "Overall property standard",
        type: "DROPDOWN",
        options: ["Excellent", "Good", "Fair — some attention needed", "Poor — action required"],
      },
      { label: "Anything anticipated to need attention before the tenancy ends?", type: "TEXT" },
      { label: "Any issues logged for the maintenance team?", type: "DROPDOWN", options: YES_NO },
      { label: "Details of any issues", type: "TEXT" },
      { label: "Photos", type: "PHOTO" },
    ],
  },
  {
    title: "Sign-off",
    fields: [
      { label: "I confirm this inspection followed the ProptMate Condition & Compliance Standard, including Awaab's Law hazard review", type: "DROPDOWN", options: YES_NO },
      { label: "Property free from Category 1 hazards, to the best of my assessment", type: "DROPDOWN", options: YES_NO },
      { label: "Inspector signature", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-proptmate-midterm-standard-template.js YOUR_COMPANY_ID");
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
      name: "ProptMate Mid-Term Inspection — Full Standard",
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
