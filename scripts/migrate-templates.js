// Keeps every template in step with the product's defaults, automatically, on every Vercel build -
// scripts/postinstall.js runs this right after the database schema is updated, so there is nothing
// to click and nothing to remember:
//
//   1. No page breaks. Reports have none (sections run on with a 2 cm gap), so any "Page break"
//      field still sitting in a template is deleted.
//   2. Tidy template names - no "(unfurnished)", and inventories and mid-term inspections say "flat" not
//      "apartment" and read as a title: "Inventory: 2-bed apartment (unfurnished)" becomes "Inventory: 2-Bed Flat",
//      "Mid Term: 1-bed apartment" becomes "Mid Term: 1-Bed Flat".
//   3. The "Is the property furnished?" question offers Part furnished: N/A, Yes, Part furnished, No.
//   4. Every Inventory and Mid Term template gets a "Lounge/Kitchen" room, right after its Kitchen - ONCE (see
//      runOnce). The report leaves a room out when nothing was recorded in it, so it only appears in the reports
//      of properties where it was used, and it can be hidden on any template in Settings.
//   5. That room used to be called "Open Plan Kitchen/Lounge": the rooms already added under that name are
//      renamed, once.
//   6. Every Inventory template gets a "Patio/Balcony" room (unless it already has a balcony, patio or other
//      external space), after the garden if there is one - ONCE.
//
// Every step only changes something that still needs changing, so running it on each deploy is
// harmless and a second run changes nothing. Each step is on its own: one failing never stops the
// others, and nothing here can fail a deploy - it always exits cleanly and tries again next time.
//
// (The same name-cleaning rule lives in lib/templateDisplayName.ts for what is shown on screen;
// this is plain JavaScript because it runs during the build, before the app itself is compiled.)

function cleanTemplateName(name) {
  let out = name
    .replace(/\s*\(\s*HMO\s*,\s*unfurnished\s*\)/gi, " (HMO)")
    .replace(/\s*\(\s*unfurnished\s*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Inventories and Mid Term inspections say "flat", never "apartment", and are written as a title ("Inventory:
  // 2-Bed Flat", "Mid Term: 5-Bed House") - only "<n>-bed <flat|house|bungalow|maisonette|apartment>" and "studio
  // <flat|apartment>" in a title that starts "Inventory:" or "Mid Term:", so a template that is really about
  // something else is left alone.
  if (/^\s*(inventory|mid[\s-]?term)\s*:/i.test(out)) {
    const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    out = out
      .replace(/\b(\d+)([-\s])(bed|bedroom)\s+(apartment|flat|house|bungalow|maisonette)\b/gi, (_m, n, sep, bed, kind) => `${n}${sep}${cap(bed)} ${/^apartment$/i.test(kind) ? "Flat" : cap(kind)}`)
      .replace(/\bstudio\s+(apartment|flat)\b/gi, () => "Studio Flat");
  }
  return out;
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
  const templates = await prisma.template.findMany({
    where: {
      OR: [
        { name: { contains: "unfurnished", mode: "insensitive" } },
        { name: { contains: "apartment", mode: "insensitive" } },
        { name: { startsWith: "Inventory", mode: "insensitive" } }, // so "2-bed house" becomes "2-Bed House" too
        { name: { startsWith: "Mid", mode: "insensitive" } }, // Mid Term: the same
      ],
    },
    select: { id: true, name: true },
  });
  let renamed = 0;
  for (const template of templates) {
    const name = cleanTemplateName(template.name);
    // Never rename to nothing (a template literally called "Unfurnished"), and leave names the cleaner
    // doesn't change (the word used some other way, e.g. "Unfurnished property check" or "Mid Term: 2-bed apartment").
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

// --- 4. the open-plan room ---------------------------------------------------------------------------------------
const OPEN_PLAN_TITLE = "Lounge/Kitchen";
const OLD_OPEN_PLAN_TITLE = "Open Plan Kitchen/Lounge"; // what the room was called when it was first added
const HAS_OPEN_PLAN = /open plan|lounge\s*\/\s*kitchen/i;
const PATIO_TITLE = "Patio/Balcony";
const HAS_OUTDOOR_SPACE = /patio|balcon|external space|terrace/i;
const ROOM_CONDITION = [
  "Move-in ready — no issues identified",
  "Minor attention — cosmetic only, no action needed now",
  "Needs action — schedule follow-up",
  "Priority repair — address as soon as possible",
];
// A section that closes a template (declaration, signatures, readings, safety...) - when a template has no
// kitchen to put the new room after, it goes in front of these rather than after the signatures.
const CLOSING_SECTION = /^\s*(utility|keys|deposit|forwarding|safety|declaration|signature|health|overall|additional|maintenance|licence)/i;

// The room is built from the template's OWN kitchen - same fields, same wording, same dropdown options - so it
// matches whichever style the template uses: an inventory room (item list, Comments, Photos) or a mid-term room
// (condition rating, "What did you observe?", Photos). Nothing in it is mandatory, so a property that is not open
// plan never has to fill it in.
function roomFieldsLike(template, model, title) {
  if (model && model.fields.length > 0) {
    return model.fields.map((f, i) => ({
      label: f.label.includes(model.title.trim()) ? f.label.replace(model.title.trim(), title) : f.label,
      type: f.type,
      options: f.options ?? null,
      mandatory: false,
      order: i,
    }));
  }
  if (template.inspectionType === "mid-term") {
    return [
      { label: "Room condition rating", type: "DROPDOWN", options: JSON.stringify(ROOM_CONDITION), mandatory: false, order: 0 },
      { label: "What did you observe?", type: "TEXT", options: null, mandatory: false, order: 1 },
      { label: "Photos", type: "PHOTO", options: null, mandatory: false, order: 2 },
    ];
  }
  return [
    { label: `${title} — item list`, type: "INVENTORY_SECTION", options: null, mandatory: false, order: 0 },
    { label: "Comments", type: "TEXT", options: null, mandatory: false, order: 1 },
    { label: "Photos", type: "PHOTO", options: null, mandatory: false, order: 2 },
  ];
}
const openPlanFields = (template, model) => roomFieldsLike(template, model, OPEN_PLAN_TITLE);

async function addOpenPlanRoom(prisma) {
  const templates = await prisma.template.findMany({
    where: { OR: [{ inspectionType: "mid-term" }, { name: { startsWith: "Inventory", mode: "insensitive" } }] },
    select: {
      id: true,
      name: true,
      inspectionType: true,
      sections: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true, fields: { orderBy: { order: "asc" }, select: { label: true, type: true, options: true } } } },
    },
  });
  let added = 0;
  let alreadyHad = 0;
  for (const t of templates) {
    if (t.sections.some((s) => HAS_OPEN_PLAN.test(s.title))) {
      alreadyHad++;
      continue;
    }
    const kitchen = t.sections.find((s) => /^\s*kitchen\b/i.test(s.title));
    const living = t.sections.find((s) => /^\s*(living room|reception room( 1)?|lounge)\s*$/i.test(s.title));
    const model = kitchen || living || null;
    let afterOrder;
    if (model) afterOrder = model.order;
    else {
      const closing = t.sections.find((s) => CLOSING_SECTION.test(s.title));
      afterOrder = closing ? closing.order - 1 : t.sections.reduce((m, s) => Math.max(m, s.order), -1);
    }
    await prisma.$transaction([
      prisma.templateSection.updateMany({ where: { templateId: t.id, order: { gt: afterOrder } }, data: { order: { increment: 1 } } }),
      prisma.templateSection.create({
        data: { templateId: t.id, title: OPEN_PLAN_TITLE, order: afterOrder + 1, hidden: false, fields: { create: openPlanFields(t, model) } },
      }),
    ]);
    added++;
  }
  return { added, alreadyHad };
}

// The room used to be called "Open Plan Kitchen/Lounge". Rename the ones already added (the section and the label of
// its item list) - the answers and items recorded in them belong to the fields themselves and are not affected.
async function renameOpenPlanRoom(prisma) {
  const sections = await prisma.templateSection.findMany({
    where: { title: { equals: OLD_OPEN_PLAN_TITLE, mode: "insensitive" } },
    select: { id: true, fields: { select: { id: true, label: true } } },
  });
  let renamed = 0;
  for (const section of sections) {
    await prisma.templateSection.update({ where: { id: section.id }, data: { title: OPEN_PLAN_TITLE } });
    for (const field of section.fields) {
      if (/open plan kitchen\/lounge/i.test(field.label)) {
        await prisma.templateField.update({ where: { id: field.id }, data: { label: field.label.replace(/open plan kitchen\/lounge/i, OPEN_PLAN_TITLE) } });
      }
    }
    renamed++;
  }
  return { renamed };
}

// A Patio/Balcony room for every inventory template that has no balcony, patio or other external space of its own.
// It goes after the garden if there is one, otherwise after the last room, and copies that room's own fields.
async function addPatioBalconyRoom(prisma) {
  const templates = await prisma.template.findMany({
    where: { name: { startsWith: "Inventory", mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      inspectionType: true,
      sections: { orderBy: { order: "asc" }, select: { id: true, title: true, order: true, fields: { orderBy: { order: "asc" }, select: { label: true, type: true, options: true } } } },
    },
  });
  let added = 0;
  let alreadyHad = 0;
  const last = (list) => list.reduce((a, s) => (s.order >= a.order ? s : a), list[0]);
  for (const t of templates) {
    if (t.sections.some((s) => HAS_OUTDOOR_SPACE.test(s.title))) {
      alreadyHad++;
      continue;
    }
    const rooms = t.sections.filter((s) => s.fields.some((f) => f.type === "INVENTORY_SECTION"));
    const gardens = rooms.filter((s) => /^\s*(garden|yard|outside)/i.test(s.title));
    const after = gardens.length ? last(gardens) : rooms.length ? last(rooms) : null;
    let afterOrder;
    if (after) afterOrder = after.order;
    else {
      const closing = t.sections.find((s) => CLOSING_SECTION.test(s.title));
      afterOrder = closing ? closing.order - 1 : t.sections.reduce((m, s) => Math.max(m, s.order), -1);
    }
    await prisma.$transaction([
      prisma.templateSection.updateMany({ where: { templateId: t.id, order: { gt: afterOrder } }, data: { order: { increment: 1 } } }),
      prisma.templateSection.create({
        data: { templateId: t.id, title: PATIO_TITLE, order: afterOrder + 1, hidden: false, fields: { create: roomFieldsLike(t, after, PATIO_TITLE) } },
      }),
    ]);
    added++;
  }
  return { added, alreadyHad };
}

// Runs a change once, ever: a ledger row says it has been done, so it is never repeated - not on the next deploy,
// and not after somebody deletes what it added on purpose. The row is written only after the change succeeds, so a
// failure is simply tried again next deploy.
async function runOnce(prisma, key, change) {
  const done = await prisma.appliedMigration.findUnique({ where: { key } });
  if (done) return { alreadyApplied: true };
  const result = await change(prisma);
  try {
    await prisma.appliedMigration.create({ data: { key } });
  } catch {
    // two deploys running at the same moment: the other one recorded it first - fine.
  }
  return result;
}

async function runTemplateMigrations(prisma, log = console.warn) {
  const results = {};
  const steps = [
    ["pageBreaks", removePageBreaks],
    ["templateNames", renameTemplates],
    ["furnishedQuestion", addPartFurnished],
    ["openPlanRoom", (p) => runOnce(p, "open-plan-kitchen-lounge-2026-10", addOpenPlanRoom)],
    ["loungeKitchenName", (p) => runOnce(p, "lounge-kitchen-rename-2026-10", renameOpenPlanRoom)],
    ["patioBalconyRoom", (p) => runOnce(p, "patio-balcony-room-2026-10", addPatioBalconyRoom)],
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
    part(r.furnishedQuestion, `${r.furnishedQuestion.updated} furnished question${r.furnishedQuestion.updated === 1 ? "" : "s"} updated`) + "; " +
    part(r.openPlanRoom, r.openPlanRoom && r.openPlanRoom.alreadyApplied ? "Lounge/Kitchen room already added" : `Lounge/Kitchen room added to ${r.openPlanRoom.added} template${r.openPlanRoom.added === 1 ? "" : "s"}`) + "; " +
    part(r.loungeKitchenName, r.loungeKitchenName && r.loungeKitchenName.alreadyApplied ? "Lounge/Kitchen rename already done" : `Lounge/Kitchen name applied to ${r.loungeKitchenName.renamed} room${r.loungeKitchenName.renamed === 1 ? "" : "s"}`) + "; " +
    part(r.patioBalconyRoom, r.patioBalconyRoom && r.patioBalconyRoom.alreadyApplied ? "Patio/Balcony room already added" : `Patio/Balcony room added to ${r.patioBalconyRoom.added} template${r.patioBalconyRoom.added === 1 ? "" : "s"}`) + "."
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

module.exports = { cleanTemplateName, isFurnishedQuestion, withPartFurnished, removePageBreaks, renameTemplates, addPartFurnished, addOpenPlanRoom, renameOpenPlanRoom, addPatioBalconyRoom, runOnce, runTemplateMigrations, summarise };

if (require.main === module) {
  main().finally(() => process.exit(0));
}
