"use client";

import { useState } from "react";
import { hideSection, hideField, unhideField, addField, reorderSections, reorderFields } from "@/lib/actions/templates";

type Field = {
  id: string;
  label: string;
  type: string;
  hidden: boolean;
  mandatory: boolean;
  options: string | null;
};

type Section = {
  id: string;
  title: string;
  hidden: boolean;
  fields: Field[];
};

const typeLabels: Record<string, string> = {
  YES_NO: "Yes / No",
  DROPDOWN: "Dropdown",
  MULTIPLE_CHOICE: "Multiple choice (radio buttons)",
  SCORE: "Score (1-5)",
  TEXT: "Text (multi-line)",
  SHORT_TEXT: "Text (single line)",
  NUMBER: "Number",
  DATE: "Date",
  PHOTO: "Photo",
  INFO_TEXT: "Instructional text (display only)",
  TERMS: "Terms & conditions (display only)",
  SIGNATURE: "Signature",
  PAGE_BREAK: "Page break",
  GRID_SECTION: "Comparison block (display only — not yet linked to prior inspections)",
  INVENTORY_SECTION: "Inventory section (room item list, condition + photos)",
};

// Native HTML5 drag-and-drop — no extra dependency needed for something this contained.
// Local state gives instant visual feedback on drop; the actual persisted order is saved via
// reorderSections/reorderFields right after, so a failed save just means a page refresh
// reverts to the last-saved order rather than silently diverging.
export default function TemplateSectionsEditor({ templateId, initialSections }: { templateId: string; initialSections: Section[] }) {
  const [sections, setSections] = useState(initialSections);
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<{ sectionId: string; fieldId: string } | null>(null);

  const handleSectionDrop = async (targetSectionId: string) => {
    if (!draggedSectionId || draggedSectionId === targetSectionId) {
      setDraggedSectionId(null);
      return;
    }

    const fromIndex = sections.findIndex((s) => s.id === draggedSectionId);
    const toIndex = sections.findIndex((s) => s.id === targetSectionId);
    const reordered = [...sections];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    setSections(reordered);
    setDraggedSectionId(null);
    reorderSections(templateId, reordered.map((s) => s.id)).catch(() => {});
  };

  const handleFieldDrop = async (sectionId: string, targetFieldId: string) => {
    if (!draggedField || draggedField.sectionId !== sectionId || draggedField.fieldId === targetFieldId) {
      setDraggedField(null);
      return;
    }

    const section = sections.find((s) => s.id === sectionId);
    if (!section) {
      setDraggedField(null);
      return;
    }

    const fromIndex = section.fields.findIndex((f) => f.id === draggedField.fieldId);
    const toIndex = section.fields.findIndex((f) => f.id === targetFieldId);
    const reorderedFields = [...section.fields];
    const [moved] = reorderedFields.splice(fromIndex, 1);
    reorderedFields.splice(toIndex, 0, moved);

    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, fields: reorderedFields } : s)));
    setDraggedField(null);
    reorderFields(templateId, reorderedFields.map((f) => f.id)).catch(() => {});
  };

  const visibleSections = sections.filter((s) => !s.hidden);

  return (
    <div className="space-y-6">
      {visibleSections.map((section) => {
        const visibleFields = section.fields.filter((f) => !f.hidden);
        const hiddenFields = section.fields.filter((f) => f.hidden);

        return (
          <div
            key={section.id}
            draggable
            onDragStart={() => setDraggedSectionId(section.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleSectionDrop(section.id)}
            className={`bg-white border border-line rounded-xl overflow-hidden transition-opacity ${draggedSectionId === section.id ? "opacity-40" : ""}`}
          >
            <div className="bg-paper px-5 py-3 border-b border-line flex items-center justify-between cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-2">
                <span className="text-slate select-none" title="Drag to reorder">
                  ⠿
                </span>
                <h2 className="font-display font-600 text-ink">{section.title}</h2>
              </div>
              <form action={hideSection}>
                <input type="hidden" name="sectionId" value={section.id} />
                <input type="hidden" name="templateId" value={templateId} />
                <button type="submit" className="text-xs text-slate hover:text-ink underline">
                  Hide section
                </button>
              </form>
            </div>

            {visibleFields.length > 0 && (
              <div className="divide-y divide-line">
                {visibleFields.map((field) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => setDraggedField({ sectionId: section.id, fieldId: field.id })}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => handleFieldDrop(section.id, field.id)}
                    className={`px-5 py-3 flex items-start justify-between gap-4 cursor-grab active:cursor-grabbing transition-opacity ${
                      draggedField?.fieldId === field.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-slate select-none mt-0.5" title="Drag to reorder">
                        ⠿
                      </span>
                      <div>
                        <p className="text-sm text-ink">{field.label}</p>
                        {field.type === "DROPDOWN" && field.options && (
                          <p className="text-xs text-slate mt-1">{(JSON.parse(field.options) as string[]).join(" · ")}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {field.mandatory && <span className="text-xs px-2 py-0.5 rounded-full bg-signal/10 text-signal">Mandatory</span>}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-verified/10 text-verified">{typeLabels[field.type]}</span>
                      <form action={hideField}>
                        <input type="hidden" name="fieldId" value={field.id} />
                        <input type="hidden" name="templateId" value={templateId} />
                        <button type="submit" title="Hide this field" className="text-xs text-slate hover:text-ink">
                          ✕
                        </button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {hiddenFields.length > 0 && (
              <div className="px-5 py-3 border-t border-line bg-paper">
                <p className="text-xs text-slate mb-2">Hidden fields in this section</p>
                <div className="flex flex-wrap gap-2">
                  {hiddenFields.map((field) => (
                    <form key={field.id} action={unhideField}>
                      <input type="hidden" name="fieldId" value={field.id} />
                      <input type="hidden" name="templateId" value={templateId} />
                      <button type="submit" className="text-xs px-3 py-1 rounded-full border border-line text-slate hover:text-ink hover:border-ink transition-colors">
                        👁 Unhide "{field.label}"
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            )}

            <details className="px-5 py-3 border-t border-line">
              <summary className="text-sm text-slate cursor-pointer hover:text-ink">+ Add field</summary>
              <form action={addField} className="mt-3 space-y-3">
                <input type="hidden" name="sectionId" value={section.id} />
                <input type="hidden" name="templateId" value={templateId} />

                <input name="label" required placeholder="Field label, e.g. Cleanliness of this room" className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />

                <div className="grid grid-cols-2 gap-3">
                  <select name="type" className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
                    <option value="TEXT">Text (multi-line)</option>
                    <option value="SHORT_TEXT">Text (single line)</option>
                    <option value="NUMBER">Number</option>
                    <option value="DATE">Date</option>
                    <option value="YES_NO">Yes / No</option>
                    <option value="DROPDOWN">Dropdown</option>
                    <option value="MULTIPLE_CHOICE">Multiple choice (radio buttons)</option>
                    <option value="SCORE">Score (1-5)</option>
                    <option value="PHOTO">Photo</option>
                    <option value="INFO_TEXT">Instructional text (display only)</option>
                    <option value="TERMS">Terms &amp; conditions (display only)</option>
                    <option value="SIGNATURE">Signature</option>
                    <option value="PAGE_BREAK">Page break</option>
                    <option value="GRID_SECTION">Comparison block (display only)</option>
                    <option value="INVENTORY_SECTION">Inventory section (room item list)</option>
                  </select>

                  <label className="flex items-center gap-2 text-sm text-slate">
                    <input type="checkbox" name="mandatory" className="rounded border-line" />
                    Mandatory in remote reports
                  </label>
                </div>

                <textarea
                  name="options"
                  rows={3}
                  placeholder={"For Dropdown: one option per line, e.g.\nn/a\nYes\nNo\n\nFor Instructional text / Terms: the text to display"}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                />

                <button type="submit" className="bg-ink text-white px-4 py-1.5 rounded-full text-xs font-medium hover:bg-signal transition-colors">
                  Add field
                </button>
              </form>
            </details>
          </div>
        );
      })}
    </div>
  );
}
