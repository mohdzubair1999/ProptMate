// Run with: node --env-file=.env scripts/fix-house-templates.js
// Preview first with: node --env-file=.env scripts/fix-house-templates.js --dry-run
//
// Adds the room sections that were missing from the 3, 4, 5, and 6-bed house templates
// already created in the live database. The seed script itself (seed-inventory-template.js)
// was already fixed separately for any future template creation — this only fixes templates
// that already exist.
//
//   - Garage: was missing from every house template.
//   - Downstairs W.C.: was only ever in the 5-bed and 6-bed templates, missing from 3-bed
//     and 4-bed.
//   - A second/third bathroom (Bathroom 2 for 3/4/5-bed, Bathroom 3 for 6-bed, since it
//     already had a Bathroom 2): added but hidden by default, since not every property has
//     an extra bathroom — turned on per-property only when it's actually needed.
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes("--dry-run");

// Each insert is applied in order, right after the named anchor section — anchors are
// re-searched against the current, already-partially-updated title list each time, so a
// later insert correctly accounts for an earlier one shifting positions.
const TARGETS = [
  {
    templateName: "Inventory: 3-bed house (unfurnished)",
    inserts: [
      { title: "Downstairs W.C.", after: "Hallway", hidden: false },
      { title: "Bathroom 2", after: "Bathroom", hidden: true },
      { title: "Garage", after: "Spare room (if needed)", hidden: false },
    ],
  },
  {
    templateName: "Inventory: 4-bed house (unfurnished)",
    inserts: [
      { title: "Downstairs W.C.", after: "Hallway", hidden: false },
      { title: "Bathroom 2", after: "Bathroom", hidden: true },
      { title: "Garage", after: "Spare room (if needed)", hidden: false },
    ],
  },
  {
    templateName: "Inventory: 5-bed house (unfurnished)",
    inserts: [
      { title: "Bathroom 2", after: "Bathroom", hidden: true },
      { title: "Garage", after: "Spare room (if needed)", hidden: false },
    ],
  },
  {
    templateName: "Inventory: 6-bed house (unfurnished)",
    inserts: [
      { title: "Bathroom 3", after: "Bathroom 2", hidden: true },
      { title: "Garage", after: "Bedroom 6", hidden: false },
    ],
  },
];

// Same fields every other room section already has, in the same order — including the page
// break every room gets except whichever one happens to be last in the sequence. None of
// these inserts are ever the last room in their template, so they always get one.
function roomFields(roomTitle) {
  return [
    { label: `${roomTitle} — item list`, type: "INVENTORY_SECTION" },
    { label: "Comments", type: "TEXT" },
    { label: "Photos", type: "PHOTO" },
    { label: "— Page break —", type: "PAGE_BREAK" },
  ];
}

// Loose comparison used only to catch near-duplicates (different punctuation, spacing, or
// case) that an exact-match check would miss — not used for anything else, since the actual
// stored titles must stay exactly as they are for every real match/insert decision.
function normalizeTitle(title) {
  return title.trim().toLowerCase().replace(/\.$/, "");
}

async function fixTemplate(template, inserts) {
  const existingSections = await prisma.templateSection.findMany({
    where: { templateId: template.id },
    orderBy: { order: "asc" },
  });
  const existingByTitle = new Map(existingSections.map((s) => [s.title, s]));

  // Catches a section that's clearly meant to be the same thing but doesn't exactly match
  // (different punctuation, case, or stray whitespace) — inserting a second, correctly-named
  // section while leaving a malformed near-duplicate sitting in the template would make
  // things worse, not better, so this refuses to touch the template automatically rather
  // than guess which one is "right."
  for (const ins of inserts) {
    const normalizedTarget = normalizeTitle(ins.title);
    const nearDuplicate = existingSections.find((s) => normalizeTitle(s.title) === normalizedTarget && s.title !== ins.title);
    if (nearDuplicate) {
      console.error(
        `"${template.name}": found an existing section titled "${nearDuplicate.title}" (order ${nearDuplicate.order}) that looks like it's meant to be "${ins.title}" but doesn't exactly match — skipping this template entirely, needs a manual look before this can run safely.`
      );
      return;
    }
  }

  const stillNeeded = inserts.filter((ins) => !existingByTitle.has(ins.title));
  if (stillNeeded.length === 0) {
    console.log(`"${template.name}" already has everything it needs — skipping.`);
    return;
  }

  const titles = existingSections.map((s) => s.title);
  const hiddenByTitle = new Map(); // only for the sections this script is creating

  for (const ins of stillNeeded) {
    const anchorIndex = titles.indexOf(ins.after); // re-searched fresh, after any earlier insert
    if (anchorIndex === -1) {
      console.error(`"${template.name}": can't find "${ins.after}" to insert "${ins.title}" after — skipping this one, needs a manual look.`);
      continue;
    }
    titles.splice(anchorIndex + 1, 0, ins.title);
    hiddenByTitle.set(ins.title, ins.hidden);
  }

  if (DRY_RUN) {
    console.log(`\n[dry run] "${template.name}" — planned new section order:`);
    titles.forEach((t, i) => {
      const isNew = !existingByTitle.has(t);
      console.log(`  ${i}: ${t}${isNew ? `  <-- new section${hiddenByTitle.get(t) ? ", hidden by default" : ""}` : ""}`);
    });
    return;
  }

  // Explicit, generous timeout — a full template has roughly 20+ sections each needing a
  // sequential round-trip, and Prisma's default interactive-transaction timeout is short
  // enough that real network latency could plausibly exceed it, aborting the whole fix
  // partway through rather than completing cleanly.
  await prisma.$transaction(
    async (tx) => {
      for (let i = 0; i < titles.length; i++) {
        const title = titles[i];
        const existing = existingByTitle.get(title);

        if (existing) {
          // Only touches order — everything else about this section (fields, hidden state,
          // any customisation already made) stays exactly as it is.
          if (existing.order !== i) {
            await tx.templateSection.update({ where: { id: existing.id }, data: { order: i } });
          }
          continue;
        }

        const created = await tx.templateSection.create({
          data: { templateId: template.id, title, order: i, hidden: hiddenByTitle.get(title) || false },
        });
        const fields = roomFields(title);
        for (let f = 0; f < fields.length; f++) {
          await tx.templateField.create({
            data: { sectionId: created.id, label: fields[f].label, type: fields[f].type, order: f },
          });
        }
      }
    },
    { timeout: 30000 }
  );

  console.log(`Fixed "${template.name}" (${template.id}).`);
}

async function main() {
  for (const target of TARGETS) {
    const templates = await prisma.template.findMany({ where: { name: target.templateName } });
    if (templates.length === 0) {
      console.log(`No template found named "${target.templateName}" — nothing to fix there.`);
      continue;
    }
    for (const template of templates) {
      await fixTemplate(template, target.inserts);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
