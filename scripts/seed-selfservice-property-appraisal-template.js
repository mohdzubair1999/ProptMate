// Creates the "Self-Service: Property Appraisal/Fact Find (Landlord)" template.
// NOTE: same self-service caveat — this is a landlord-facing form; no landlord portal
// access exists yet for them to submit it directly. Template content seeded regardless.
// Run with: node --env-file=.env scripts/seed-selfservice-property-appraisal-template.js YOUR_COMPANY_ID

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const YES_NO = ["Yes", "No"];
const ARRANGE_OPTIONS = ["Yes", "No, please organise (I agree to pay the additional cost)", "No, I will organise", "Ordered"];

const sections = [
  {
    title: "About this form",
    fields: [{ label: "About this form", type: "TERMS", options: "This form gathers the information we need to appraise and market your property." }],
  },
  {
    title: "General property details",
    fields: [
      {
        label: "About this section",
        type: "INFO_TEXT",
        options: "We're required to establish ownership of each property we let, and the capacity in which our client is letting it. You'll be asked for this information along with proof of ownership.",
      },
      { label: "Owner's full name", type: "TEXT" },
      { label: "Photo(s) of proof of ownership (land registry, solicitor's completion letter)", type: "PHOTO" },
      { label: "If letting on behalf of the owner, your full name, address and relationship to the owner", type: "TEXT" },
      { label: "Photo(s) of written authority (power of attorney, grant of probate, etc.) — certified copy required", type: "PHOTO" },
      { label: "Property address", type: "TEXT" },
      { label: "Photo(s) of the front of the property", type: "PHOTO" },
      { label: "Your correspondence address", type: "TEXT" },
      { label: "Property type", type: "TEXT" },
      {
        label: "Level of furnishings",
        type: "DROPDOWN",
        options: [
          "Unfurnished",
          "White goods only (landlord responsible for repairs/replacement)",
          "White goods only (tenant responsible for repairs/replacement)",
          "Part furnished",
          "Fully furnished",
        ],
      },
      { label: "Reason for market appraisal", type: "TEXT" },
      { label: "Number of bedrooms", type: "SHORT_TEXT" },
      { label: "Special features", type: "TEXT" },
      {
        label: "Mortgage or management company",
        type: "INFO_TEXT",
        options: "If the property has a mortgage or management company, we'll need sight of written permission to let before marketing.",
      },
      { label: "Is permission to let required, and if so from whom?", type: "SHORT_TEXT" },
      { label: "Copy of permission (letter from mortgagee or management company)", type: "PHOTO" },
      { label: "Are you willing to accept tenants with children?", type: "DROPDOWN", options: YES_NO },
      { label: "Are you willing to accept tenants with pets?", type: "DROPDOWN", options: ["Yes", "No", "Some — see comments"] },
      {
        label: "Legionella risk assessment",
        type: "INFO_TEXT",
        options: "A written Legionella risk assessment is recommended and mandatory to have undertaken. We can organise this, subject to our contractor's third-party charge.",
      },
      { label: "Do you have a valid Legionella risk assessment in place?", type: "DROPDOWN", options: ARRANGE_OPTIONS },
      { label: "If yes, please provide a photo", type: "PHOTO" },
      {
        label: "Gas safety check",
        type: "INFO_TEXT",
        options: "If your property has a gas supply, a Gas Safety Check is mandatory. We can organise this, subject to our contractor's third-party charge.",
      },
      { label: "Do you have a valid Gas Safety Certificate?", type: "DROPDOWN", options: [...ARRANGE_OPTIONS, "N/A — no gas at property"] },
      { label: "If yes, please provide a photo", type: "PHOTO" },
      {
        label: "EPC",
        type: "INFO_TEXT",
        options: "A valid EPC is mandatory before marketing. We can organise this, subject to our contractor's third-party charge.",
      },
      { label: "Do you have a valid EPC?", type: "DROPDOWN", options: ARRANGE_OPTIONS },
      { label: "If yes, please provide a photo", type: "PHOTO" },
      { label: "Comments", type: "TEXT" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Level of service",
    fields: [
      { label: "What level of service do you require from us?", type: "DROPDOWN", options: ["Full management", "Rent collection", "Let only", "Advertise only"] },
      {
        label: "Overseas landlord",
        type: "INFO_TEXT",
        options: "If classed as an overseas landlord, we'll need a letter from HMRC with your NRL reference, otherwise tax will be deducted from rents before remitting the balance to you.",
      },
      { label: "Are you resident in the UK?", type: "DROPDOWN", options: YES_NO },
      { label: "If no, have you advised HMRC that we'll be managing the property for you?", type: "DROPDOWN", options: ["Yes", "No", "N/A"] },
      { label: "If you'd like us to provide your accountant with copies of statements, please give their full details", type: "TEXT" },
    ],
  },
  {
    title: "Smoke and carbon monoxide alarms",
    fields: [
      {
        label: "Smoke/CO alarms",
        type: "INFO_TEXT",
        options: "The Smoke and Carbon Monoxide Alarm Regulations require a working smoke alarm on every storey and a CO alarm in any room with a solid-fuel appliance, confirmed before each new tenancy begins.",
      },
      { label: "Working smoke alarm(s) fitted on every storey?", type: "DROPDOWN", options: ["Yes", "No", "Not sure"] },
      { label: "CO alarm(s) fitted where required (solid-fuel or gas appliances)?", type: "DROPDOWN", options: ["Yes", "No", "Not sure", "N/A — no relevant appliances"] },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Additional services",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "Additional services incur additional charges — refer to our terms of business for details." },
      {
        label: "Please indicate which additional services you require",
        type: "MULTIPLE_CHOICE",
        options: [
          "Organise boiler service",
          "Organise Electrical Safety Certificate (EICR) prior to move-in",
          "Organise Electrical Safety Certificate (EICR) 5-yearly (fully managed only)",
          "Organise EPC prior to marketing",
          "Organise Gas Safety prior to move-in",
          "Organise Gas Safety annually (fully managed only)",
          "Organise key cutting prior to move-in",
          "Organise key cutting for subsequent move-ins, if necessary",
          "Organise Legionella Risk Assessment prior to move-in",
          "Organise Legionella Risk Assessment bi-annually (fully managed only)",
          "Organise oil tank service",
          "Organise Portable Appliance Testing (PAT) prior to move-in",
          "Organise PAT annually (fully managed only)",
          "Organise septic tank emptying prior to check-in",
          "Register and safeguard deposit within 30 days of receipt",
          "No additional services required",
        ],
      },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Marketing of the property",
    fields: [
      { label: "Do you wish to provide a full set of photos for marketing?", type: "DROPDOWN", options: ["Yes", "No, please arrange for these to be taken"] },
      { label: "Would you be willing to create a video walkthrough of the property?", type: "DROPDOWN", options: YES_NO },
      { label: "Please note", type: "INFO_TEXT", options: "We're unable to market the property without a valid EPC and signed terms of business." },
      { label: "When do you wish us to start marketing the property?", type: "DATE" },
      { label: "Comments", type: "TEXT" },
    ],
  },
  {
    title: "Keys",
    fields: [
      {
        label: "About this section",
        type: "INFO_TEXT",
        options: "We'll need 4 sets of keys if managing the property. We can arrange additional sets to be cut, subject to our contractor's third-party charge.",
      },
      { label: "Sets of keys", type: "DROPDOWN", options: ["I will provide all sets of keys", "I will provide a set, please organise additional sets (I agree to pay the additional cost)"] },
      { label: "Photo(s) of keys", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Leasehold details",
    fields: [
      { label: "Please provide full details of the freeholder", type: "TEXT" },
      { label: "Please provide full details of the management company", type: "TEXT" },
      { label: "Please provide full details of any restrictive covenants", type: "TEXT" },
      { label: "Comments", type: "TEXT" },
      { label: "Relevant photos", type: "PHOTO" },
    ],
  },
  {
    title: "Exterior",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "Please provide information on all exterior areas at the property, selecting each area and providing the details requested." },
      { label: "Exterior areas", type: "GRID_SECTION", options: "Landlord/property questionnaire: exterior areas" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Interior",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "Please provide information on all interior areas at the property, selecting each area and providing the details requested." },
      { label: "Interior areas", type: "GRID_SECTION", options: "Landlord/property questionnaire: interior areas" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
      { label: "— Page break —", type: "PAGE_BREAK" },
    ],
  },
  {
    title: "Utilities",
    fields: [
      { label: "About this section", type: "INFO_TEXT", options: "Please provide full details of all utilities serving the property." },
      { label: "Utilities", type: "GRID_SECTION", options: "Landlord/property questionnaire: utilities" },
      { label: "Additional comments", type: "TEXT" },
      { label: "Additional photos", type: "PHOTO" },
    ],
  },
  {
    title: "Material facts",
    fields: [
      {
        label: "About this section",
        type: "INFO_TEXT",
        options: "We're required to disclose all material facts to a prospective tenant before they make an offer — i.e. anything that could bear on their decision to let.",
      },
      { label: "Please disclose all material facts in relation to the property", type: "TEXT" },
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
    title: "Declaration",
    fields: [{ label: "Declaration", type: "TERMS", options: "By submitting this form, you confirm the information provided is accurate to the best of your knowledge." }],
  },
];

async function main() {
  const companyId = process.argv[2];
  if (!companyId) {
    console.error("Usage: node --env-file=.env scripts/seed-selfservice-property-appraisal-template.js YOUR_COMPANY_ID");
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
      name: "Self-Service: Property Appraisal/Fact Find (Landlord)",
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
