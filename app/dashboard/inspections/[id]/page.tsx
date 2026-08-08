import { getSession } from "@/lib/session";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { addInspectionItem, completeInspection, reopenInspection, deleteInspection } from "@/lib/actions/inspections";
import { generateReport, deleteReport } from "@/lib/actions/reports";
import AssignClientSelect from "./assign-client-select";
import ComparisonSelect from "./comparison-select";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import PhotoUpload from "./photo-upload";
import AiPolishButton from "@/components/AiPolishButton";
import AnalyzePhotoButton from "@/components/AnalyzePhotoButton";
import VoiceInput from "@/components/VoiceInput";
import { TemplateInspectionView } from "./template-view";
import AiSummaryBox from "./ai-summary";
import EmailReportForm from "./email-report";
import { CONDITION_OPTIONS, CONDITION_LABELS, CONDITION_STYLES } from "@/lib/inventoryConditions";

export default async function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inspection = await prisma.inspection.findUnique({
    where: { id: id },
    include: {
      property: true,
      inspector: true,
      items: { orderBy: { room: "asc" }, include: { photos: true } },
      report: true,
      template: true,
      assignedClient: true,
      comparedToInspection: true,
    },
  });

  if (!inspection) notFound();

  const propertyClients = await prisma.propertyAccess.findMany({
    where: { propertyId: inspection.propertyId },
    include: { user: true },
  });

  const siblingInspections = await prisma.inspection.findMany({
    where: { propertyId: inspection.propertyId, id: { not: inspection.id }, status: "completed" },
    orderBy: { completedDate: "desc" },
  });

  const isDraft = inspection.status === "draft";

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

      {propertyClients.length > 0 && isDraft && (
        <section className="mt-6 bg-white border border-line rounded-xl p-4">
          <p className="text-sm text-slate mb-2">
            Self-service: let a tenant/landlord fill this out themselves instead of you.
          </p>
          <AssignClientSelect
            inspectionId={inspection.id}
            clients={propertyClients.map((a) => ({ userId: a.userId, label: `${a.user.name || a.user.email} (${a.relation.toLowerCase()})` }))}
            initialClientId={inspection.assignedClientId}
          />
          {inspection.assignedClient && (
            <p className="text-xs text-verified mt-2">
              Currently assigned to {inspection.assignedClient.name || inspection.assignedClient.email} — visible in their portal.
            </p>
          )}
        </section>
      )}

      {siblingInspections.length > 0 && isDraft && inspection.templateId && (
        <section className="mt-6 bg-white border border-line rounded-xl p-4">
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
          {inspection.comparedToInspection && (
            <p className="text-xs text-verified mt-2">
              Comparing against {inspection.comparedToInspection.type.replace("-", " ")} from{" "}
              {inspection.comparedToInspection.completedDate ? new Date(inspection.comparedToInspection.completedDate).toLocaleDateString() : "—"}.
            </p>
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
                <div key={item.id} className="bg-white border border-line rounded-xl p-4 flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-ink">
                      {item.room} — {item.itemName}
                    </p>
                    {item.notes && <p className="text-sm text-slate mt-1">{item.notes}</p>}

                    {item.photos.length > 0 && (
                      <div className="flex gap-2 mt-3 flex-wrap">
                        {item.photos.map((photo) => (
                          <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                            <Image src={photo.url} alt={`${item.room} ${item.itemName}`} width={80} height={80} className="rounded-lg object-cover w-20 h-20 border border-line" />
                          </a>
                        ))}
                      </div>
                    )}

                    {isDraft && item.photos.length > 0 && (
                      <AnalyzePhotoButton
                        photoUrls={item.photos.map((p) => p.url)}
                        itemId={item.id}
                        inspectionId={inspection.id}
                        context={`${item.room} — ${item.itemName}`}
                      />
                    )}

                    {isDraft && <PhotoUpload itemId={item.id} />}
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ml-4 ${CONDITION_STYLES[item.condition] || "bg-slate/10 text-slate"}`}>
                    {CONDITION_LABELS[item.condition] || item.condition}
                  </span>
                </div>
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
