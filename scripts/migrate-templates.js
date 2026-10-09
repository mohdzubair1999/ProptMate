// Keeps every template in step with the product's defaults, automatically, on every Vercel build -
// scripts/postinstall.js runs this right after the database schema is updated, so there is nothing
// to click and nothing to remember:
//
//   1. No page breaks. Reports have none (sections run on with a 2 cm gap), so any "Page break"
//      field still sitting in a template is deleted.
//   2. No "(unfurnished)" in template names - "Inventory: 2-bed apartment (unfurnished)" becomes
//      "Inventory: 2-bed apartment".
//   3. The "Is the property furnished?" question offers Part furnished: N/A, Yes, Part furnished, No.
//
// Every step only changes something that still needs changing, so running it on each deploy is
// harmless and a second run changes nothing. Each step is on its own: one failing never stops the
// others, and nothing here can fail a deploy - it always exits cleanly and tries again next time.
//
// (The same name-cleaning rule lives in lib/templateDisplayName.ts for what is shown on screen;
// this is plain JavaScript because it runs during the build, before the app itself is compiled.)

function cleanTemplateName(name) {
  return name
    .replace(/\s*\(\s*HMO\s*,\s*unfurnished\s*\)/gi, " (HMO)")
    .replace(/\s*\(\s*unfurnished\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// The exact question only - never any question that merely mentions the word.
function isFurnishedQuestion(label) {
  return /^\s*is the property furnished\s*\??\s*$/i.test(label);
}

// The new stored answer list for the furnished question, or null when nothing needs changing (not a
// plain list of text, empty, or "Part furnished" already there). It sits between Yes and No.
function withPartFurnished(raw) {
  if (!raw) return null;
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length === 0 || !list.every((x) => typeof x === "string")) return null;
  if (list.some((x) => x.trim().toLowerCase() === "part furnished")) return null;
  const yes = list.findIndex((x) => x.trim().toLowerCase() === "yes");
  const next = yes >= 0 ? [...list.slice(0, yes + 1), "Part furnished", ...list.slice(yes + 1)] : [...list, "Part furnished"];
  return JSON.stringify(next);
}

async function removePageBreaks(prisma) {
  const fields = await prisma.templateField.findMany({ where: { type: "PAGE_BREAK" }, select: { id: true } });
  if (fields.length === 0) return { removed: 0, kept: 0 };
  const ids = fields.map((f) => f.id);
  // A page break is only a divider and never holds an answer - but if one somehow does, it is left
  // alone rather than risk losing anything. The report ignores it either way.
  const answered = new Set();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await prisma.fieldAnswer.findMany({ where: { fieldId: { in: ids.slice(i, i + 500) } }, select: { fieldId: true } });
    rows.forEach((r) => answered.add(r.fieldId));
  }
  const deletable = ids.filter((id) => !answered.has(id));
  let removed = 0;
  for (let i = 0; i < deletable.length; i += 500) {
    const res = await prisma.templateField.deleteMany({ where: { id: { in: deletable.slice(i, i + 500) } } });
    removed += res.count;
  }
  return { removed, kept: answered.size };
}

async function renameTemplates(prisma) {
  const templates = await prisma.template.findMany({ where: { name: { contains: "unfurnished", mode: "insensitive" } }, select: { id: true, name: true } });
  let renamed = 0;
  for (const template of templates) {
    const name = cleanTemplateName(template.name);
    // Never rename to nothing (a template literally called "Unfurnished"), and leave names the cleaner
    // doesn't change (the word used some other way, e.g. "Unfurnished property check").
    if (!name || name === template.name) continue;
    await prisma.template.update({ where: { id: template.id }, data: { name } });
    renamed++;
  }
  return { renamed };
}

async function addPartFurnished(prisma) {
  const fields = await prisma.templateField.findMany({
    where: { type: "DROPDOWN", label: { contains: "furnished", mode: "insensitive" } },
    select: { id: true, label: true, options: true },
  });
  let updated = 0;
  for (const field of fields) {
    if (!isFurnishedQuestion(field.label)) continue;
    const next = withPartFurnished(field.options);
    if (next === null) continue;
    await prisma.templateField.update({ where: { id: field.id }, data: { options: next } });
    updated++;
  }
  return { updated };
}

async function runTemplateMigrations(prisma, log = console.warn) {
  const results = {};
  const steps = [
    ["pageBreaks", removePageBreaks],
    ["templateNames", renameTemplates],
    ["furnishedQuestion", addPartFurnished],
  ];
  for (const [name, step] of steps) {
    try {
      results[name] = await step(prisma);
    } catch (err) {
      const message = String((err && err.message) || err).slice(0, 200);
      results[name] = { error: message };
      log(`Template cleanup: the "${name}" step failed (${message}) - it will be tried again on the next deploy.`);
    }
  }
  return results;
}

function summarise(r) {
  const part = (res, text) => (res && res.error ? "could not run" : text);
  const pb = r.pageBreaks;
  return (
    "Template cleanup: " +
    part(pb, `${pb.removed} page break${pb.removed === 1 ? "" : "s"} removed${pb.kept ? ` (${pb.kept} kept - they hold answers)` : ""}`) + "; " +
    part(r.templateNames, `${r.templateNames.renamed} template name${r.templateNames.renamed === 1 ? "" : "s"} tidied`) + "; " +
    part(r.furnishedQuestion, `${r.furnishedQuestion.updated} furnished question${r.furnishedQuestion.updated === 1 ? "" : "s"} updated`) + "."
  );
}

async function main() {
  let prisma;
  try {
    const { PrismaClient } = require("@prisma/client");
    prisma = new PrismaClient();
    console.log(summarise(await runTemplateMigrations(prisma)));
  } catch (err) {
    console.warn("Template cleanup skipped:", String((err && err.message) || err).slice(0, 200));
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }
}

module.exports = { cleanTemplateName, isFurnishedQuestion, withPartFurnished, removePageBreaks, renameTemplates, addPartFurnished, runTemplateMigrations, summarise };

if (require.main === module) {
  main().finally(() => process.exit(0));
}
