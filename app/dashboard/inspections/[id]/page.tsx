import { getSession } from "@/lib/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { FieldType } from "@prisma/client";
import { addInspectionItem, completeInspection, reopenInspection, deleteInspection, deletePhoto, deleteImportedCheckIn } from "@/lib/actions/inspections";
import EditableInventoryItem from "./editable-inventory-item";
import { generateReport, deleteReport } from "@/lib/actions/reports";
import ComparisonSelect from "./comparison-select";
import ImportCheckInReport from "./import-checkin-report";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import AiPolishButton from "@/components/AiPolishButton";
import VoiceInput from "@/components/VoiceInput";
import { TemplateInspectionView } from "./template-view";
import AiSummaryBox from "./ai-summary";
import EmailReportForm from "./email-report";
import { CONDITION_OPTIONS } from "@/lib/inventoryConditions";
import SummaryReferenceSection from "./summary-reference-section";

export default async function InspectionDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ justCompleted?: string }> }) {
  const { id } = await params;
  const { justCompleted } = await searchParams;
  const inspection = await prisma.inspection.findUnique({
    where: { id: id },
    include: {
      property: true,
      inspector: true,
      items: { orderBy: { room: "asc" }, include: { photos: true } },
      report: true,
      template: true,
      comparedToInspection: true,
    },
  });

  if (!inspection) notFound();

  const siblingInspections = await prisma.inspection.findMany({
    where: { propertyId: inspection.propertyId, id: { not: inspection.id }, status: "completed" },
    orderBy: { completedDate: "desc" },
  });

  const isDraft = inspection.status === "draft";

  // Only the field types an AI mapping could genuinely fill with a text value — PHOTO,
  // SIGNATURE, and structural/display types (INFO_TEXT, TERMS, PAGE_BREAK, GRID_SECTION,
  // INVENTORY_SECTION) aren't real data-capture fields an external report's text could map
  // onto.
  const MAPPABLE_FIELD_TYPES: FieldType[] = ["YES_NO", "DROPDOWN", "MULTIPLE_CHOICE", "SCORE", "TEXT", "SHORT_TEXT", "NUMBER", "DATE"];
  const templateFieldsForImport =
    isDraft && inspection.templateId
      ? (
          await prisma.templateField.findMany({
            where: { section: { templateId: inspection.templateId }, type: { in: MAPPABLE_FIELD_TYPES }, hidden: false },
            include: { section: true },
          })
        ).map((f) => ({ id: f.id, sectionTitle: f.section.title, label: f.label, type: f.type, options: f.options ?? undefined }))
      : [];

  const session = await getSession();
  const role = (session?.user as any)?.role as string | undefined;
  const canManage = role === "ADMIN" || role === "MANAGER";

  return (
    <main>
      <Link href="/dashboard/inspections" className="text-sm text-slate hover:text-ink">
        ← Back to inspections
      </Link>

      <div className="flex items-start justify-between mt-4 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink capitalize">
            {inspection.type} — {inspection.property.address}
          </h1>
          <p className="text-sm text-slate mt-1">Inspector: {inspection.inspector.name || inspection.inspector.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-3 py-1.5 rounded-full h-fit ${isDraft ? "bg-signal/10 text-signal" : "bg-verified/10 text-verified"}`}>
            {inspection.status}
          </span>
          {!isDraft && (
            <form action={reopenInspection}>
              <input type="hidden" name="inspectionId" value={inspection.id} />
              <button type="submit" className="text-xs px-3 py-1.5 rounded-full border border-line text-slate hover:text-ink hover:border-ink transition-colors">
                Reopen to edit
              </button>
            </form>
          )}
          {canManage && (
            <form action={deleteInspection}>
              <input type="hidden" name="inspectionId" value={inspection.id} />
              <ConfirmSubmitButton confirmMessage="Delete this entire inspection? This removes all its items, photos, and any generated report. This cannot be undone." className="text-xs text-red-600 hover:text-red-700 underline">
                Delete inspection
              </ConfirmSubmitButton>
            </form>
          )}
        </div>
      </div>

      <SummaryReferenceSection
        inspectionId={inspection.id}
        initialValues={{
          propertyDescription: inspection.propertyDescription,
          clientName: inspection.clientName,
          clientAddress: inspection.clientAddress,
          otherAlarmLocation: inspection.otherAlarmLocation,
          otherAlarmTested: inspection.otherAlarmTested,
          boilerLocation: inspection.boilerLocation,
          stopcockLocation: inspection.stopcockLocation,
          fuseBoxLocation: inspection.fuseBoxLocation,
        }}
      />

      {(siblingInspections.length > 0 || templateFieldsForImport.length > 0) && isDraft && inspection.templateId && (
        <section className="mt-6 bg-white border border-line rounded-xl p-4">
          {siblingInspections.length > 0 && (
            <>
              <p className="text-sm text-slate mb-2">
                Compare against an earlier inspection — shows what it was last time next to what you're entering now. Only works when both use the exact same template.
              </p>
              <ComparisonSelect
                inspectionId={inspection.id}
                options={siblingInspections.map((s) => ({
                  id: s.id,
                  label: `${s.type.replace("-", " ")} — ${s.completedDate ? new Date(s.completedDate).toLocaleDateString() : "no date"}`,
                  sameTemplate: s.templateId === inspection.templateId,
                }))}
                initialValue={inspection.comparedToInspectionId}
              />
            </>
          )}
          {inspection.comparedToInspection && !inspection.comparedToInspection.sourceDocumentUrl && (
            <p className="text-xs text-verified mt-2">
              Comparing against {inspection.comparedToInspection.type.replace("-", " ")} from{" "}
              {inspection.comparedToInspection.completedDate ? new Date(inspection.comparedToInspection.completedDate).toLocaleDateString() : "—"}.
            </p>
          )}
          {inspection.comparedToInspection?.sourceDocumentUrl && (
            <div className="mt-2 bg-signal/10 border border-signal/30 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-ink">
                  ⚠ Comparing against a check-in report imported from an external document. AI-matched fields should be double-checked against{" "}
                  <a href={inspection.comparedToInspection.sourceDocumentUrl} target="_blank" rel="noopener noreferrer" className="text-signal underline">
                    the original report
                  </a>
                  .
                </p>
                <form action={deleteImportedCheckIn.bind(null, inspection.id)} className="shrink-0">
                  <ConfirmSubmitButton
                    confirmMessage="Remove this imported check-in comparison? You can upload a report again afterwards."
                    className="text-xs text-slate hover:text-red-600 underline whitespace-nowrap"
                  >
                    Remove
                  </ConfirmSubmitButton>
                </form>
              </div>
              {inspection.comparedToInspection.importedRoomSummaries && (
                <div className="mt-2 space-y-1.5">
                  {(() => {
                    try {
                      const rooms = JSON.parse(inspection.comparedToInspection.importedRoomSummaries) as { room: string; summary: string }[];
                      return rooms.map((r, i) => (
                        <p key={i} className="text-xs text-ink">
                          <span className="font-medium">{r.room}:</span> {r.summary}
                        </p>
                      ));
                    } catch {
                      return null;
                    }
                  })()}
                </div>
              )}
            </div>
          )}
          {templateFieldsForImport.length > 0 && (!inspection.comparedToInspection || inspection.comparedToInspection.sourceDocumentUrl) && (
            <div>
              <p className="text-sm text-slate mt-3 mb-1">
                {siblingInspections.length > 0 ? "Or, if the check-in wasn't done in ProptMate:" : "No earlier inspection in ProptMate for this property — if you have a check-in report from elsewhere:"}
              </p>
              <ImportCheckInReport inspectionId={inspection.id} templateFields={templateFieldsForImport} />
            </div>
          )}
        </section>
      )}

      {inspection.templateId ? (
        <TemplateInspectionView
          inspectionId={inspection.id}
          templateId={inspection.templateId}
          isDraft={isDraft}
          compareToInspectionId={inspection.comparedToInspectionId && inspection.comparedToInspection?.templateId === inspection.templateId ? inspection.comparedToInspectionId : null}
        />
      ) : (
        <>
          <h2 className="font-display font-600 text-lg text-ink mt-10">Items ({inspection.items.length})</h2>

          {inspection.items.length === 0 ? (
            <p className="text-sm text-slate mt-3">No items recorded yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {inspection.items.map((item) => (
                <EditableInventoryItem key={item.id} item={item} isDraft={isDraft} inspectionId={inspection.id} />
              ))}
            </div>
          )}

          {isDraft && (
            <>
              <h2 className="font-display font-600 text-lg text-ink mt-10">Add item</h2>
              <form action={addInspectionItem} className="mt-4 bg-white border border-line rounded-xl p-6 space-y-4 max-w-lg">
                <input type="hidden" name="inspectionId" value={inspection.id} />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-slate">Room</label>
                    <input name="room" required placeholder="Kitchen" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                  </div>
                  <div>
                    <label className="text-sm text-slate">Item</label>
                    <input name="itemName" required placeholder="Wall" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                  </div>
                </div>

                <div>
                  <label className="text-sm text-slate">Condition</label>
                  <select name="condition" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
                    {CONDITION_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-sm text-slate">Notes (optional)</label>
                  <textarea
                    id="item-notes"
                    name="notes"
                    rows={2}
                    placeholder="Small hairline crack near the window."
                    className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                  />
                  <div className="flex items-center gap-2 flex-wrap mt-1">
                    <VoiceInput targetId="item-notes" />
                    <AiPolishButton targetId="item-notes" context="Inspection item note" />
                  </div>
                </div>

                <button type="submit" className="bg-ink text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-signal transition-colors">
                  Add item
                </button>
              </form>
            </>
          )}
        </>
      )}

      {isDraft && (
        <form action={completeInspection} className="mt-6">
          <input type="hidden" name="inspectionId" value={inspection.id} />
          <button type="submit" className="bg-verified text-white px-6 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            Mark inspection complete
          </button>
        </form>
      )}

      {!isDraft && (
        <>
          {justCompleted === "1" && (
            <section className="mt-6 bg-verified/10 border border-verified/20 rounded-xl p-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-verified/15 text-verified flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
              <div>
                <p className="font-display font-600 text-ink">Nice work — inspection complete</p>
                <p className="text-sm text-slate mt-0.5">You can generate the report below whenever you're ready.</p>
              </div>
            </section>
          )}

          <AiSummaryBox inspectionId={inspection.id} existingSummary={inspection.aiSummary} />

          <section className="mt-6 bg-white border border-line rounded-xl p-6">
            <h2 className="font-display font-600 text-lg text-ink">Final report</h2>
            {inspection.report?.pdfUrl ? (
              <div className="mt-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <a href={inspection.report.pdfUrl} target="_blank" rel="noreferrer" className="bg-ink text-white px-5 py-2 rounded-full text-sm font-medium hover:bg-signal transition-colors">
                    Download PDF report
                  </a>
                  <a href={inspection.report.pdfUrl} target="_blank" rel="noreferrer" className="border border-line text-ink px-5 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors">
                    🖨 Print report
                  </a>
                  <form action={deleteReport}>
                    <input type="hidden" name="inspectionId" value={inspection.id} />
                    <ConfirmSubmitButton confirmMessage="Delete this report? You can generate a new one afterwards." className="text-xs text-red-600 hover:text-red-700 underline">
                      Delete report
                    </ConfirmSubmitButton>
                  </form>
                </div>
                <p className="text-xs text-slate mt-2">
                  Generated {new Date(inspection.report.generatedAt).toLocaleString()} · shareable link, no login required. Opening the PDF
                  and pressing <span className="font-medium">⌘P</span> (or your browser's print icon) prints it directly.
                </p>
                <EmailReportForm inspectionId={inspection.id} />
              </div>
            ) : (
              <p className="text-sm text-slate mt-2">No report generated yet.</p>
            )}
            <form action={generateReport} className="mt-4">
              <input type="hidden" name="inspectionId" value={inspection.id} />
              <button type="submit" className="border border-line text-ink px-5 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors">
                {inspection.report?.pdfUrl ? "Regenerate report" : "Generate report"}
              </button>
            </form>
          </section>
        </>
      )}
    </main>
  );
}
