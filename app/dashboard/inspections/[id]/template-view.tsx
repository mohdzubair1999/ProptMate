import { prisma } from "@/lib/prisma";
import { toggleSectionForInspection } from "@/lib/actions/answers";
import AutoSaveField from "@/components/AutoSaveField";
import { addInspectionItem } from "@/lib/actions/inspections";
import PhotoUpload from "./photo-upload";
import PhotoGridWithDelete from "./photo-grid-with-delete";
import EditableInventoryItem from "./editable-inventory-item";
import AiPolishButton from "@/components/AiPolishButton";
import AnalyzePhotoButton from "@/components/AnalyzePhotoButton";
import VoiceNoteReview from "@/components/VoiceNoteReview";
import SignaturePad from "./signature-pad";
import StandardItemsChecklist from "./standard-items-checklist";
import { CONDITION_OPTIONS, CONDITION_LABELS, CONDITION_STYLES } from "@/lib/inventoryConditions";
import { CLEANLINESS_OPTIONS } from "@/lib/inventoryCleanliness";
import { getStandardItemsForRoom } from "@/lib/standardInventoryItems";
import type { SectionTab } from "./section-tabs-layout";

// Returns one tab per visible room/section rather than rendering its own page layout — the
// caller (page.tsx) combines these with its own "Overview" tab and hands the full set to
// SectionTabsLayout, so the two files' content lives in one unified sidebar. Every field's
// actual rendering logic below is unchanged from before; only how each section's finished
// JSX gets handed back to the caller is different.
export async function TemplateInspectionView({
  inspectionId,
  templateId,
  isDraft,
  compareToInspectionId,
}: {
  inspectionId: string;
  templateId: string;
  isDraft: boolean;
  compareToInspectionId?: string | null;
}): Promise<SectionTab[]> {
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, deletedAt: null },
    select: { excludedSectionIds: true },
  });
  const excludedIds: string[] = inspection?.excludedSectionIds ? JSON.parse(inspection.excludedSectionIds) : [];

  // Since compareToInspectionId is only ever passed when both inspections share the same
  // template (checked by the caller), we can safely match by fieldId directly — no fuzzy
  // label-matching needed, which keeps this reliable rather than guessing.
  let compareAnswerByField = new Map<string, { value: string | null; photos: { id: string; url: string }[] }>();
  let compareItemsByField = new Map<string, { id: string; itemName: string; condition: string; notes: string | null }[]>();
  if (compareToInspectionId) {
    const compareAnswers = await prisma.fieldAnswer.findMany({ where: { inspectionId: compareToInspectionId }, include: { photos: true } });
    compareAnswerByField = new Map(compareAnswers.map((a) => [a.fieldId, { value: a.value, photos: a.photos }]));

    const compareItems = await prisma.inspectionItem.findMany({
      where: { inspectionId: compareToInspectionId, templateFieldId: { not: null }, inspection: { deletedAt: null } },
    });
    for (const item of compareItems) {
      if (!item.templateFieldId) continue;
      const list = compareItemsByField.get(item.templateFieldId) || [];
      list.push(item);
      compareItemsByField.set(item.templateFieldId, list);
    }
  }

  const template = await prisma.template.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        where: { hidden: false },
        orderBy: { order: "asc" },
        include: { fields: { where: { hidden: false }, orderBy: { order: "asc" } } },
      },
    },
  });

  const answers = await prisma.fieldAnswer.findMany({ where: { inspectionId }, include: { photos: true } });
  const answerByField = new Map(answers.map((a) => [a.fieldId, a]));

  const inventoryItems = await prisma.inspectionItem.findMany({
    where: { inspectionId, templateFieldId: { not: null }, inspection: { deletedAt: null } },
    include: { photos: true },
    orderBy: { itemName: "asc" },
  });
  const itemsByField = new Map<string, typeof inventoryItems>();
  for (const item of inventoryItems) {
    if (!item.templateFieldId) continue;
    const list = itemsByField.get(item.templateFieldId) || [];
    list.push(item);
    itemsByField.set(item.templateFieldId, list);
  }

  if (!template) return [{ id: "not-found", title: "Error", content: <p className="text-sm text-slate">Template not found.</p> }];

  const visibleSections = template.sections.filter((s) => !excludedIds.includes(s.id));
  const excludedSections = template.sections.filter((s) => excludedIds.includes(s.id));

  return visibleSections.map((section) => ({
    id: section.id,
    title: section.title,
    content: (
      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <div className="bg-paper px-5 py-3 border-b border-line flex items-center justify-between">
          <h2 className="font-display font-600 text-ink">{section.title}</h2>
          {isDraft && (
            <form action={toggleSectionForInspection}>
              <input type="hidden" name="inspectionId" value={inspectionId} />
              <input type="hidden" name="sectionId" value={section.id} />
              <button type="submit" className="text-xs text-slate hover:text-ink underline">
                Hide
              </button>
            </form>
          )}
        </div>

          <div className="divide-y divide-line">
            {section.fields.map((field, idx) => {
              if (field.type === "PAGE_BREAK") {
                return <div key={field.id} className="border-t-2 border-dashed border-line" />;
              }

              const existing = answerByField.get(field.id);
              const options: string[] =
                (field.type === "DROPDOWN" || field.type === "MULTIPLE_CHOICE") && field.options ? JSON.parse(field.options) : [];

              // Find the nearest preceding TEXT field in this section, so a Photo field can
              // feed its AI analysis into the right notes box (common pattern: notes then photo)
              const precedingTextField = [...section.fields.slice(0, idx)].reverse().find((f) => f.type === "TEXT");

              return (
                <div key={field.id} className="px-5 py-4">
                  <p className="text-sm text-ink mb-1">
                    {field.label} {field.mandatory && <span className="text-signal">*</span>}
                  </p>
                  {compareToInspectionId &&
                    compareAnswerByField.has(field.id) &&
                    !["INVENTORY_SECTION", "PHOTO", "SIGNATURE", "INFO_TEXT", "TERMS", "GRID_SECTION", "PAGE_BREAK"].includes(field.type) && (
                      <p className="text-xs text-slate mb-2">
                        Last time: <span className="font-medium text-ink">{compareAnswerByField.get(field.id)?.value || "—"}</span>
                      </p>
                    )}

                  {field.type === "INVENTORY_SECTION" ? (
                    <div>
                      {isDraft && (
                        <StandardItemsChecklist
                          inspectionId={inspectionId}
                          templateFieldId={field.id}
                          room={field.label}
                          standardItems={getStandardItemsForRoom(section.title)}
                          alreadyAddedNames={(itemsByField.get(field.id) || []).map((i) => i.itemName)}
                        />
                      )}
                      {compareToInspectionId &&
                        (() => {
                          const currentNames = new Set((itemsByField.get(field.id) || []).map((i) => i.itemName.toLowerCase()));
                          const notYetChecked = (compareItemsByField.get(field.id) || []).filter((p) => !currentNames.has(p.itemName.toLowerCase()));
                          if (notYetChecked.length === 0) return null;
                          return (
                            <div className="mb-3 bg-paper border border-dashed border-line rounded-lg p-3">
                              <p className="text-xs text-slate mb-2">From last time — not yet re-checked here:</p>
                              <div className="space-y-1">
                                {notYetChecked.map((p) => (
                                  <div key={p.id} className="flex items-center justify-between text-sm">
                                    <span className="text-ink">{p.itemName}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${CONDITION_STYLES[p.condition] || "bg-slate/10 text-slate"}`}>
                                      {CONDITION_LABELS[p.condition] || p.condition}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}

                      {(itemsByField.get(field.id) || []).length > 0 && (
                        <div className="space-y-2 mb-3">
                          {(itemsByField.get(field.id) || []).map((item) => {
                            const previousItem = compareToInspectionId
                              ? (compareItemsByField.get(field.id) || []).find((p) => p.itemName.toLowerCase() === item.itemName.toLowerCase())
                              : null;
                            return (
                              <div key={item.id}>
                                {compareToInspectionId && (
                                  <p className="text-xs text-slate mb-1">
                                    Last time:{" "}
                                    {previousItem ? (
                                      <>
                                        <span className={`font-medium ${previousItem.condition !== item.condition ? "text-signal" : "text-ink"}`}>
                                          {CONDITION_LABELS[previousItem.condition] || previousItem.condition}
                                        </span>
                                        {previousItem.notes ? ` — ${previousItem.notes}` : ""}
                                        {previousItem.condition !== item.condition && " (changed)"}
                                      </>
                                    ) : (
                                      "not recorded"
                                    )}
                                  </p>
                                )}
                                <EditableInventoryItem item={item} isDraft={isDraft} />
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {isDraft && (
                        <form action={addInspectionItem} className="border border-dashed border-line rounded-lg p-3 space-y-2">
                          <input type="hidden" name="inspectionId" value={inspectionId} />
                          <input type="hidden" name="templateFieldId" value={field.id} />
                          <input type="hidden" name="room" value={field.label} />
                          <div className="grid grid-cols-2 gap-2">
                            <input name="itemName" required placeholder="Item, e.g. Sofa" className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                            <select name="condition" className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
                              {CONDITION_OPTIONS.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <input name="make" placeholder="Make (optional, for appliances)" className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                          <div className="grid grid-cols-2 gap-2">
                            <select name="cleanliness" className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
                              <option value="">Cleanliness: not assessed</option>
                              {CLEANLINESS_OPTIONS.map((c) => (
                                <option key={c.value} value={c.value}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                            <input name="cleanlinessCustom" placeholder="If Custom… selected, describe here" className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                          </div>
                          <input id={`new-item-notes-${field.id}`} name="notes" placeholder="Notes (optional)" className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                          <VoiceNoteReview targetId={`new-item-notes-${field.id}`} />
                          <button type="submit" className="bg-ink text-white px-4 py-1.5 rounded-full text-xs font-medium hover:bg-signal transition-colors">
                            Add item
                          </button>
                        </form>
                      )}
                    </div>
                  ) : field.type === "INFO_TEXT" || field.type === "TERMS" || field.type === "GRID_SECTION" ? (
                    <p className="text-sm text-slate bg-paper rounded-lg p-3 whitespace-pre-line">{field.options || "—"}</p>
                  ) : field.type === "SIGNATURE" ? (
                    <SignaturePad fieldId={field.id} inspectionId={inspectionId} existingUrl={existing?.photos?.[0]?.url} />
                  ) : field.type === "PHOTO" ? (
                    <div>
                      {compareToInspectionId && compareAnswerByField.get(field.id)?.photos && compareAnswerByField.get(field.id)!.photos.length > 0 && (
                        <div className="mb-2">
                          <p className="text-xs text-slate mb-1">Last time:</p>
                          <div className="flex gap-2 flex-wrap">
                            {compareAnswerByField.get(field.id)!.photos.map((p) => (
                              <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                                <img src={p.url} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover border border-line opacity-70" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                      {existing && existing.photos.length > 0 && (
                        <div className="mb-2">
                          <PhotoGridWithDelete photos={existing.photos} isDraft={isDraft} size="md" lazy />
                        </div>
                      )}
                      {isDraft && (section.title.toLowerCase().includes("maintenance") || precedingTextField?.label.toLowerCase() === "comments") && existing && existing.photos.length > 0 && precedingTextField && (
                        <AnalyzePhotoButton
                          photoUrls={existing.photos.map((p) => p.url)}
                          targetId={`field-${precedingTextField.id}`}
                          context={`${section.title} — ${precedingTextField.label}`}
                          inspectionId={inspectionId}
                          identifyRoom={section.title.toLowerCase().includes("maintenance")}
                          matchRoom={section.title.toLowerCase().includes("maintenance") ? undefined : section.title}
                          matchLabel={section.title.toLowerCase().includes("maintenance") ? undefined : precedingTextField.label}
                        />
                      )}
                      {isDraft && <PhotoUpload fieldId={field.id} inspectionId={inspectionId} />}
                    </div>
                  ) : isDraft ? (
                    <div>
                      {(field.type === "TEXT" || field.type === "SHORT_TEXT") && (
                        <AutoSaveField
                          id={`field-${field.id}`}
                          inspectionId={inspectionId}
                          fieldId={field.id}
                          type={field.type}
                          initialValue={existing?.value || (field.type === "TEXT" ? field.options || "" : "")}
                        />
                      )}
                      {(field.type === "NUMBER" || field.type === "DATE" || field.type === "DROPDOWN" || field.type === "MULTIPLE_CHOICE" || field.type === "SCORE" || field.type === "YES_NO") && (
                        <AutoSaveField
                          inspectionId={inspectionId}
                          fieldId={field.id}
                          type={field.type}
                          initialValue={existing?.value || ""}
                          options={options}
                        />
                      )}
                      {(section.title.toLowerCase().includes("maintenance") || field.label.toLowerCase() === "comments") && (field.type === "TEXT" || field.type === "SHORT_TEXT") && (
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          <AiPolishButton targetId={`field-${field.id}`} context={`${section.title} — ${field.label}`} multiline={field.type === "TEXT"} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate">{existing?.value || "—"}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ),
  })).concat(
    isDraft && excludedSections.length > 0
      ? [
          {
            id: "hidden-sections",
            title: `Hidden (${excludedSections.length})`,
            content: (
              <div className="bg-paper border border-line border-dashed rounded-xl p-6">
                <h2 className="font-display font-600 text-ink mb-1">Not included in this report</h2>
                <p className="text-sm text-slate mb-4">These sections were marked not needed for this specific inspection — unhide to bring one back.</p>
                <div className="flex flex-wrap gap-2">
                  {excludedSections.map((section) => (
                    <form key={section.id} action={toggleSectionForInspection}>
                      <input type="hidden" name="inspectionId" value={inspectionId} />
                      <input type="hidden" name="sectionId" value={section.id} />
                      <button type="submit" className="text-sm px-4 py-2 rounded-full border border-line text-ink hover:border-signal hover:text-signal transition-colors">
                        👁 Unhide "{section.title}"
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            ),
          },
        ]
      : []
  );
}
