"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

// Base check — any team member can adapt a template while doing an inspection (hiding a
// section that doesn't apply, adding a field they need). Just needs a company.
async function requireCompany() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) throw new Error("No company associated with this account");
  return companyId;
}

// Stricter check — creating a whole new template, a new section, or bulk-inserting a
// regulation block are structural design decisions reserved for Admin/Manager.
async function requireManagerOrAdmin() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  const role = (session.user as any).role as string;
  if (!companyId) throw new Error("No company associated with this account");
  if (role !== "ADMIN" && role !== "MANAGER") throw new Error("Only an Admin or Manager can do this");
  return companyId;
}

export async function createTemplate(formData: FormData) {
  const companyId = await requireManagerOrAdmin();

  const name = String(formData.get("name") || "").trim();
  const inspectionType = String(formData.get("inspectionType") || "mid-term");
  const propertyType = String(formData.get("propertyType") || "") || null;

  if (!name) throw new Error("Template name is required");

  const template = await prisma.template.create({ data: { companyId, name, inspectionType, propertyType } });

  revalidatePath("/dashboard/settings/templates");
  redirect(`/dashboard/settings/templates/${template.id}`);
}

export async function addSection(formData: FormData) {
  await requireManagerOrAdmin();

  const templateId = String(formData.get("templateId") || "");
  const title = String(formData.get("title") || "").trim();
  if (!templateId || !title) throw new Error("Section title is required");

  const count = await prisma.templateSection.count({ where: { templateId } });
  await prisma.templateSection.create({ data: { templateId, title, order: count } });

  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

export async function addField(formData: FormData) {
  await requireCompany();

  const sectionId = String(formData.get("sectionId") || "");
  const templateId = String(formData.get("templateId") || "");
  const label = String(formData.get("label") || "").trim();
  const type = String(formData.get("type") || "TEXT") as any;
  const optionsRaw = String(formData.get("options") || "").trim();
  const mandatory = formData.get("mandatory") === "on";

  if (!sectionId || !label) throw new Error("Field label is required");

  const options =
    (type === "DROPDOWN" || type === "MULTIPLE_CHOICE") && optionsRaw
      ? JSON.stringify(optionsRaw.split("\n").map((o) => o.trim()).filter(Boolean))
      : type === "INFO_TEXT" || type === "TERMS" || type === "GRID_SECTION" || type === "TEXT"
      ? optionsRaw || null
      : null;

  const count = await prisma.templateField.count({ where: { sectionId } });
  await prisma.templateField.create({ data: { sectionId, label, type, options, mandatory, order: count } });

  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

const HAZARD_SEVERITY = ["No concern", "Monitor — recheck at next visit", "Address within 28 days", "Urgent — address within 7 days"];
const YES_NO = ["Yes", "No"];
const YES_NO_NA = ["Yes", "No", "N/A"];

const REGULATION_BLOCKS: Record<string, { title: string; fields: { label: string; type: string; options?: string[] }[] }[]> = {
  "awaabs-law": [
    {
      title: "Health & safety review — damp and mould",
      fields: [
        { label: "Any signs of damp or mould observed?", type: "DROPDOWN", options: YES_NO },
        { label: "Severity", type: "DROPDOWN", options: HAZARD_SEVERITY },
        { label: "Location(s) and extent", type: "TEXT" },
        { label: "Photos", type: "PHOTO" },
      ],
    },
    {
      title: "Health & safety review — ventilation",
      fields: [
        { label: "Extractor fans working and unobstructed?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Any condensation observed?", type: "DROPDOWN", options: YES_NO },
        { label: "Severity", type: "DROPDOWN", options: HAZARD_SEVERITY },
        { label: "Notes", type: "TEXT" },
      ],
    },
    {
      title: "Health & safety review — fire safety",
      fields: [
        { label: "Smoke alarms fitted?", type: "DROPDOWN", options: ["Mains-wired", "Battery", "Mixed mains and battery", "No"] },
        { label: "Smoke alarms tested and working?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "CO alarm present where required?", type: "DROPDOWN", options: ["Yes", "No, but gas appliances present", "Not applicable"] },
        { label: "Notes", type: "TEXT" },
        { label: "Photos", type: "PHOTO" },
      ],
    },
  ],
  "licence-compliance": [
    {
      title: "Licence & compliance — core checklist",
      fields: [
        { label: "About this section", type: "INFO_TEXT", options: ["These checks apply regardless of licence type. Complete the HMO addendum below if the property holds an HMO licence."] as any },
        { label: "Kitchen door meets fire-check spec?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Bathroom extractor fan working?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Kitchen extractor fan working?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Licence displayed?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Comments", type: "TEXT" },
      ],
    },
    {
      title: "Licence & compliance — HMO addendum",
      fields: [
        { label: "Which licence type applies?", type: "DROPDOWN", options: ["None — not an HMO", "Selective licence", "Additional HMO licence", "Mandatory HMO licence", "Section 257 HMO"] },
        { label: "Interlinked smoke alarms and heat detector fitted per unit?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Staircases with storage are fire-proofed?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Comments", type: "TEXT" },
      ],
    },
  ],
  "front-cover": [
    {
      title: "Front cover",
      fields: [
        { label: "Front cover photo of property", type: "PHOTO" as any },
      ],
    },
  ],
  "property-licence": [
    {
      title: "Property licence details",
      fields: [
        { label: "Licence type", type: "DROPDOWN", options: ["N/A — no licence required", "Selective licence", "Additional HMO licence", "Mandatory HMO licence", "Section 257 HMO"] },
        { label: "Licence number", type: "SHORT_TEXT" as any },
        { label: "Licence holder name", type: "SHORT_TEXT" as any },
        { label: "Issuing local authority", type: "SHORT_TEXT" as any },
        { label: "Licence start date", type: "DATE" as any },
        { label: "Licence expiry date", type: "DATE" as any },
        { label: "Maximum permitted occupants (if applicable)", type: "SHORT_TEXT" as any },
        { label: "Photo of licence document", type: "PHOTO" as any },
        { label: "Comments", type: "TEXT" },
      ],
    },
  ],
  "deposit-protection": [
    {
      title: "Deposit protection",
      fields: [
        { label: "Deposit protected in a government-approved scheme?", type: "DROPDOWN", options: ["Yes", "No", "N/A — no deposit taken"] },
        { label: "Scheme used", type: "DROPDOWN", options: ["TDS", "Deposit Protection Service (DPS)", "mydeposits", "N/A"] },
        { label: "Date deposit was protected", type: "DATE" as any },
        { label: "Prescribed information provided within 30 days?", type: "DROPDOWN", options: YES_NO_NA },
        { label: "Deposit certificate / reference number", type: "SHORT_TEXT" as any },
      ],
    },
  ],
};

// One-click inserts a whole pre-built regulation block (sections + fields) into a
// user's own custom template — so building your own doesn't mean retyping every
// compliance field by hand. AI polish, voice dictation, and photo analysis apply
// automatically to any TEXT/PHOTO field added this way, same as everything else.
export async function addRegulationBlock(formData: FormData) {
  const companyId = await requireManagerOrAdmin();
  const templateId = String(formData.get("templateId") || "");
  const blockKey = String(formData.get("blockKey") || "");

  const template = await prisma.template.findFirst({ where: { id: templateId, companyId } });
  if (!template) throw new Error("Template not found");

  const block = REGULATION_BLOCKS[blockKey];
  if (!block) throw new Error("Unknown regulation block");

  const existingCount = await prisma.templateSection.count({ where: { templateId } });

  // "Front cover" belongs at the very start of a report, not the end — shift everything
  // else down by one to make room, rather than appending like other quick-add blocks.
  if (blockKey === "front-cover") {
    await prisma.templateSection.updateMany({
      where: { templateId },
      data: { order: { increment: block.length } },
    });
  }

  for (let s = 0; s < block.length; s++) {
    const section = block[s];
    const createdSection = await prisma.templateSection.create({
      data: { templateId, title: section.title, order: blockKey === "front-cover" ? s : existingCount + s },
    });

    for (let f = 0; f < section.fields.length; f++) {
      const field = section.fields[f];
      let optionsValue: string | null = null;
      if (field.options) {
        optionsValue = field.type === "INFO_TEXT" || field.type === "TERMS" ? field.options[0] : JSON.stringify(field.options);
      }
      await prisma.templateField.create({
        data: {
          sectionId: createdSection.id,
          label: field.label,
          type: field.type as any,
          options: optionsValue,
          order: f,
        },
      });
    }
  }

  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

// Hides a field rather than deleting it — any answers already recorded stay intact, the
// field just stops appearing in the live editor and future inspection forms until unhidden.
export async function hideField(formData: FormData) {
  await requireCompany();
  const fieldId = String(formData.get("fieldId") || "");
  const templateId = String(formData.get("templateId") || "");
  if (!fieldId) return;

  await prisma.templateField.update({ where: { id: fieldId }, data: { hidden: true } });
  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

export async function unhideField(formData: FormData) {
  await requireCompany();
  const fieldId = String(formData.get("fieldId") || "");
  const templateId = String(formData.get("templateId") || "");
  if (!fieldId) return;

  await prisma.templateField.update({ where: { id: fieldId }, data: { hidden: false } });
  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

export async function hideSection(formData: FormData) {
  await requireCompany();
  const sectionId = String(formData.get("sectionId") || "");
  const templateId = String(formData.get("templateId") || "");
  if (!sectionId) return;

  await prisma.templateSection.update({ where: { id: sectionId }, data: { hidden: true } });
  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

// Persists a new section order after a drag-and-drop reorder — plain-argument, called
// directly from the client component rather than through a form submission.
export async function reorderSections(templateId: string, orderedSectionIds: string[]) {
  await requireCompany();

  await prisma.$transaction(
    orderedSectionIds.map((sectionId, index) =>
      prisma.templateSection.update({ where: { id: sectionId }, data: { order: index } })
    )
  );
  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

// Same idea, for fields within a single section.
export async function reorderFields(templateId: string, orderedFieldIds: string[]) {
  await requireCompany();

  await prisma.$transaction(
    orderedFieldIds.map((fieldId, index) =>
      prisma.templateField.update({ where: { id: fieldId }, data: { order: index } })
    )
  );
  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

export async function unhideSection(formData: FormData) {
  await requireCompany();
  const sectionId = String(formData.get("sectionId") || "");
  const templateId = String(formData.get("templateId") || "");
  if (!sectionId) return;

  await prisma.templateSection.update({ where: { id: sectionId }, data: { hidden: false } });
  revalidatePath(`/dashboard/settings/templates/${templateId}`);
}

// One-off cleanup: finds every "Page Break" field sitting immediately before a "Comments"
// field, across every template this company owns, and removes it - these were forcing every
// room's Comments onto a fresh page no matter how little content came before it (react-pdf's
// break is an unconditional command, not a "doesn't fit" fallback), leaving large blank gaps
// behind on the previous page every single time. Scoped to this company only - deliberately
// not touching other companies' templates, since a page break there could be an intentional
// choice for them, not a mistake.
export async function removePageBreaksBeforeComments(
  prevState: { removed?: number; error?: string } | undefined,
  _formData: FormData
): Promise<{ removed?: number; error?: string }> {
  try {
    const companyId = await requireManagerOrAdmin();

    const sections = await prisma.templateSection.findMany({
      where: { template: { companyId } },
      include: { fields: { orderBy: { order: "asc" } } },
    });

    const idsToRemove: string[] = [];
    for (const section of sections) {
      // Matches what the report itself actually renders (which skips hidden fields entirely)
      // rather than raw stored order, so a hidden field sitting between them by order number
      // can't cause a genuine Page-Break-then-Comments pattern to be missed.
      const visibleFields = section.fields.filter((f) => !f.hidden);
      for (let i = 0; i < visibleFields.length - 1; i++) {
        const current = visibleFields[i];
        const next = visibleFields[i + 1];
        if (current.type === "PAGE_BREAK" && next.label.trim().toLowerCase() === "comments") {
          idsToRemove.push(current.id);
        }
      }
    }

    if (idsToRemove.length > 0) {
      await prisma.templateField.deleteMany({ where: { id: { in: idsToRemove } } });
    }

    revalidatePath("/dashboard/settings/templates");
    return { removed: idsToRemove.length };
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { error: err instanceof Error ? err.message : "Something went wrong — please try again" };
  }
}
