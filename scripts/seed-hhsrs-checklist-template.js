// Creates the "Housing Health and Safety Rating System (HHSRS) checklist" template.
// Run with: node --env-file=.env scripts/seed-hhsrs-checklist-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const RESULT_OPTIONS = ["Pass", "Fail — Category 1", "Fail — Category 2"];

const hazards = [
  { title: "1. Damp and mould growth", text: "Dust mites and mould/fungus growth in damp conditions can trigger allergies, asthma and fungal toxin effects." },
  { title: "2. Excess cold", text: "Temperatures below a healthy 18-21°C range can aggravate respiratory conditions and cardiovascular risk." },
  { title: "3. Excess heat", text: "Unregulated high indoor temperatures can cause dehydration, heatstroke and cardiovascular strain." },
  { title: "4. Asbestos and manufactured mineral fibres", text: "Formerly used insulation materials linked to respiratory illness and skin/eye irritation." },
  { title: "5. Biocides", text: "Chemicals used to treat timber and mould pose risks via inhalation, skin contact or ingestion." },
  { title: "6. Carbon monoxide and fuel combustion products", text: "Faulty appliances can release CO, nitrogen dioxide or smoke, risking breathing difficulty or death." },
  { title: "7. Lead", text: "Lead exposure via paint, pipes, soil or fumes can cause nervous system and blood disorders." },
  { title: "8. Radiation", text: "Radon gas from soil linked to lung cancer risk with prolonged exposure." },
  { title: "9. Uncombusted fuel gas", text: "Escaping fuel gas displaces oxygen indoors, risking suffocation or death." },
  { title: "10. Volatile organic compounds", text: "VOCs in household materials can irritate eyes/skin and cause headaches or nausea." },
  { title: "11. Crowding and space", text: "Insufficient living space can cause psychological distress and hygiene/accident risk." },
  { title: "12. Entry by intruders", text: "Inadequate security risks burglary-related stress and injury." },
  { title: "13. Lighting", text: "Inadequate light can cause eye strain and low mood." },
  { title: "14. Noise", text: "Excess noise can disrupt sleep, concentration and cause anxiety." },
  { title: "15. Domestic hygiene, pests and refuse", text: "Poor layout and waste storage can attract pests and infection risk." },
  { title: "16. Food safety", text: "Inadequate food facilities risk illness and dehydration." },
  { title: "17. Sanitation and drainage", text: "Poor hygiene facilities and drainage increase infection risk." },
  { title: "18. Water supply", text: "Contaminated water risks dehydration, infection and Legionnaires' disease." },
  { title: "19. Falls associated with baths", text: "Falls in/around baths and showers can cause cuts and bruising." },
  { title: "20. Falls on level surfaces", text: "Falls on level ground or shallow steps can cause bruising, fractures or head injury." },
  { title: "21. Falls associated with stairs and ramps", text: "Stair falls can cause fractures and head, brain or spinal injury." },
  { title: "22. Falls between levels", text: "Falls of 300mm+ (balconies, landings, windows) can cause serious injury or death." },
  { title: "23. Electrical hazards", text: "Faulty equipment or exposed wiring risks electric shock or burns." },
  { title: "24. Fire", text: "Uncontrolled fire and smoke risk burns and smoke inhalation." },
  { title: "25. Flames, hot surfaces and materials", text: "Contact with flames or hot liquids can cause burns and scalds." },
  { title: "26. Collision and entrapment", text: "Trapped fingers or collisions with fixtures can cause cuts and bruising." },
  { title: "27. Explosions", text: "Blast, debris or structural collapse risks serious injury or death." },
  { title: "28. Poor ergonomics", text: "Poorly designed space can cause physical strains and sprains." },
  { title: "29. Structural collapse and falling elements", text: "Disrepair or weather damage can risk collapse or falling material." },
];

function hazardFields(text) {
  return [
    { label: "Hazard", type: "INFO_TEXT", options: text },
    { label: "Result", type: "DROPDOWN", options: RESULT_OPTIONS },
    { label: "Additional comments", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
  ];
}

const sections = [
  {
    title: "Homes (Fitness for Human Habitation) Act 2018",
    fields: [
      {
        label: "About this checklist",
        type: "TEXT",
        options:
          "The Homes (Fitness for Human Habitation) Act 2018 draws on the 29 HHSRS hazards to help determine fitness for habitation. Each hazard is assessed as Category 1 (serious, immediate risk) or Category 2 (less urgent).",
      },
    ],
  },
  ...hazards.map((h) => ({ title: h.title, fields: hazardFields(h.text) })),
  {
    title: "Signature",
    fields: [
      { label: "Signature", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-hhsrs-checklist-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "Housing Health and Safety Rating System (HHSRS) checklist", inspectionType: "mid-term", propertyType: null },
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
