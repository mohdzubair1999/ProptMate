// Creates the "FRA review prioritising tool" template.
// Run with: node --env-file=.env scripts/seed-fra-prioritising-tool-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const questions = [
  { key: "Use = Score\nResidential = 0\nMixed = 1", q: "1. The building is:" },
  { key: "Floors = Score\n1-3 = 0\n4-6 = 3\n7-11 = 5\n12-18 = 7\nOver 18 = 9", q: "2. How many storeys does the building have?" },
  { key: "Material = Score\nMasonry = -2\nGlass = 2\nRender/ETS = 3\nBrick slip = 3\nTimber = 4\nHPL = 4\nMetal = 5\nDon't know = 5", q: "3. Predominant external wall material?" },
  { key: "Response = Score\nYes = 10\nNo = 0\nDon't know = 10", q: "4. External wall materials likely to ignite and spread fire?" },
  { key: "Response = Score\nNo = 1\nYes = 6\nNo balconies = 0", q: "5. Balcony materials likely to ignite and spread fire?" },
  { key: "Response = Score\nMetal = 0\nUPVC = 3\nWooden = 4\nDon't know = 4", q: "6. Predominant window frame material?" },
  { key: "Response = Score\nNo = 0\nYes = 4", q: "7. Does the building have spandrel or infill panels?" },
  { key: "Response = Score\nSingle staircase = 5\nMultiple staircase = 0", q: "8. How many staircases?" },
  { key: "Response = Score\nPoor = 5\nGood = 0\nN/A = 0", q: "9. Condition of flat entrance fire doors?" },
  { key: "Response = Score\nPoor = 5\nGood = 0\nN/A = 0", q: "10. Condition of communal fire doors?" },
  { key: "Response = Score\nYes = 0\nNo = 4", q: "11. Do flats have fire detection/smoke alarm systems?" },
  { key: "Response = Score\nAll actions complete = 0\nSome outstanding = 3\nNone completed = 6\nNo FRA in 3 years = 6\nN/A = 0", q: "12. Have prior FRA risks been addressed?" },
  { key: "Response = Score\nSimultaneous = 0\nStay put = 0\nTemporary measures = 4", q: "13. Evacuation strategy?" },
  { key: "Response = Score\nYes, complete = 0\nYes, not complete = 3\nNot undertaken = 4", q: "14. Compartmentation survey carried out?" },
  { key: "Response = Score\nYes = -8\nNo = 0", q: "15. Residential sprinkler systems fitted?" },
  { key: "Response = Score\nYes = 4\nNo = 10", q: "16. More than one fire incident in the last 12 months?" },
  { key: "Response = Score\nGeneral = 0\nSpecialised = 3", q: "17. What category does the building fall under?" },
  { key: "Response = Score\nYes = 3\nNo = 0\nDon't know = 1", q: "18. Unusual/complex structures with fire safety impact?" },
];

const sections = [
  {
    title: "Important",
    fields: [{ label: "Please note", type: "TERMS", options: "This tool is a screening aid to help prioritise fire risk assessment reviews and doesn't replace a full FRA." }],
  },
  {
    title: "Questions",
    fields: [
      ...questions.flatMap((item) => [
        { label: `Scoring key — ${item.q}`, type: "INFO_TEXT", options: item.key },
        { label: item.q, type: "SHORT_TEXT" },
      ]),
      { label: "Total score", type: "SHORT_TEXT" },
    ],
  },
  {
    title: "Prioritising tool banding",
    fields: [
      { label: "Tiers and banding", type: "INFO_TEXT", options: "Score = Tier\n71-82 = Tier 1\n59-70 = Tier 2\n44-58 = Tier 3\n23-43 = Tier 4\n-10 to 22 = Tier 5" },
      { label: "Banding information", type: "TERMS", options: "Refer to your organisation's fire safety policy for actions required at each tier." },
    ],
  },
  {
    title: "Actions",
    fields: [
      { label: "Actions to be taken", type: "TEXT" },
      { label: "Signature", type: "SIGNATURE" },
      { label: "Date", type: "DATE" },
    ],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-fra-prioritising-tool-template.js YOUR_COMPANY_ID");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) {
    console.error("No company found with that id.");
    process.exit(1);
  }

  const template = await prisma.template.create({
    data: { companyId, name: "FRA review prioritising tool", inspectionType: "legionella", propertyType: null },
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
