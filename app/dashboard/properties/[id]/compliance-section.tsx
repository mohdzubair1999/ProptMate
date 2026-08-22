import { addComplianceDocument, updateComplianceDocument, deleteComplianceDocument } from "@/lib/actions/compliance";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import DocumentDateFields from "./document-date-fields";
import { TYPE_LABELS as typeLabels, DOCUMENT_DEFAULTS } from "@/lib/complianceDocumentTypes";

// How long each document type is typically valid for, and how far ahead of expiry to start
// warning — a Gas Safety cert (renews yearly) needs an earlier warning than a 10-year EPC,
// so a single flat threshold for everything doesn't reflect how these actually work.
function getStatus(expiryDate: Date | null, type: string): { label: string; className: string } {
  if (!expiryDate) return { label: "No expiry tracked", className: "bg-slate/10 text-slate" };
  const warnDays = DOCUMENT_DEFAULTS[type]?.warnDays ?? 60;
  const daysUntil = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return { label: "Expired", className: "bg-red-100 text-red-700" };
  if (daysUntil <= warnDays) return { label: "Expiring soon", className: "bg-signal/10 text-signal" };
  return { label: "Valid", className: "bg-verified/10 text-verified" };
}

type ComplianceDoc = {
  id: string;
  type: string;
  otherTypeLabel: string | null;
  certificateNumber: string | null;
  issuingBody: string | null;
  issueDate: Date | null;
  expiryDate: Date | null;
  documentUrl: string | null;
  notes: string | null;
};

export default function ComplianceSection({ propertyId, documents }: { propertyId: string; documents: ComplianceDoc[] }) {
  // Group by type so a property with years of history (e.g. several past Gas Safety certs)
  // shows one clear "current" entry per type instead of a flat, growing, undifferentiated
  // list. "Current" = whichever has the latest expiry date within its type (falls back to
  // most recently added if no dates are set).
  const groups = new Map<string, ComplianceDoc[]>();
  for (const doc of documents) {
    const key = doc.type === "OTHER" ? `OTHER:${doc.otherTypeLabel || ""}` : doc.type;
    const list = groups.get(key) || [];
    list.push(doc);
    groups.set(key, list);
  }

  const sections = Array.from(groups.values()).map((docs) => {
    const sorted = [...docs].sort((a, b) => {
      const aTime = a.expiryDate ? new Date(a.expiryDate).getTime() : -Infinity;
      const bTime = b.expiryDate ? new Date(b.expiryDate).getTime() : -Infinity;
      return bTime - aTime;
    });
    return { current: sorted[0], history: sorted.slice(1) };
  });

  return (
    <div className="mt-10">
      <h2 className="font-display font-600 text-lg text-ink">Compliance documents</h2>
      <p className="text-sm text-slate mt-1">Gas Safety, EICR, EPC, licences, and other certificates for this property.</p>

      {sections.length > 0 && (
        <div className="mt-4 space-y-2">
          {sections.map(({ current: doc, history }) => (
            <ComplianceDocCard key={doc.id} propertyId={propertyId} doc={doc} history={history} />
          ))}
        </div>
      )}

      <AddDocumentForm propertyId={propertyId} />
    </div>
  );
}

function ComplianceDocCard({ propertyId, doc, history }: { propertyId: string; doc: ComplianceDoc; history: ComplianceDoc[] }) {
  const status = getStatus(doc.expiryDate, doc.type);
  return (
    <div className="bg-white border border-line rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink">
              {doc.type === "OTHER" ? doc.otherTypeLabel || "Other" : typeLabels[doc.type]}
            </p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${status.className}`}>{status.label}</span>
          </div>
          <p className="text-xs text-slate mt-1">
            {doc.certificateNumber && `Cert #${doc.certificateNumber} · `}
            {doc.issuingBody && `${doc.issuingBody} · `}
            {doc.issueDate && `Issued ${new Date(doc.issueDate).toLocaleDateString()} · `}
            {doc.expiryDate ? `Expires ${new Date(doc.expiryDate).toLocaleDateString()}` : "No expiry set"}
          </p>
          {doc.notes && <p className="text-xs text-slate mt-1">{doc.notes}</p>}
          {doc.documentUrl && (
            <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-signal hover:underline mt-1 inline-block">
              View uploaded document
            </a>
          )}
        </div>
        <form action={deleteComplianceDocument}>
          <input type="hidden" name="documentId" value={doc.id} />
          <input type="hidden" name="propertyId" value={propertyId} />
          <ConfirmSubmitButton confirmMessage="Delete this compliance document?" className="text-xs text-red-600 hover:text-red-700 underline shrink-0">
            Delete
          </ConfirmSubmitButton>
        </form>
      </div>

      <details className="mt-3">
        <summary className="text-xs text-slate cursor-pointer hover:text-ink">Edit</summary>
        <EditDocumentForm propertyId={propertyId} doc={doc} />
      </details>

      {history.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-slate cursor-pointer hover:text-ink">
            {history.length} previous {history.length === 1 ? "certificate" : "certificates"} on file
          </summary>
          <div className="mt-3 space-y-2 pl-3 border-l-2 border-line">
            {history.map((old) => {
              const oldStatus = getStatus(old.expiryDate, old.type);
              return (
                <div key={old.id} className="flex items-center justify-between text-xs text-slate">
                  <span>
                    {old.expiryDate ? `Expires ${new Date(old.expiryDate).toLocaleDateString()}` : "No expiry set"}
                    {" · "}
                    <span className={`px-1.5 py-0.5 rounded-full ${oldStatus.className}`}>{oldStatus.label}</span>
                    {old.certificateNumber && ` · Cert #${old.certificateNumber}`}
                    {old.documentUrl && (
                      <>
                        {" · "}
                        <a href={old.documentUrl} target="_blank" rel="noreferrer" className="text-signal hover:underline">
                          View
                        </a>
                      </>
                    )}
                  </span>
                  <form action={deleteComplianceDocument}>
                    <input type="hidden" name="documentId" value={old.id} />
                    <input type="hidden" name="propertyId" value={propertyId} />
                    <ConfirmSubmitButton confirmMessage="Delete this historical document?" className="text-red-600 hover:text-red-700 underline">
                      Delete
                    </ConfirmSubmitButton>
                  </form>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

function EditDocumentForm({ propertyId, doc }: { propertyId: string; doc: ComplianceDoc }) {
  return (
    <form action={updateComplianceDocument} className="mt-3 grid grid-cols-2 gap-3">
      <input type="hidden" name="documentId" value={doc.id} />
      <input type="hidden" name="propertyId" value={propertyId} />
      <div>
        <label className="text-xs text-slate">Certificate number</label>
        <input name="certificateNumber" defaultValue={doc.certificateNumber || ""} className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-xs text-slate">Issuing body</label>
        <input name="issuingBody" defaultValue={doc.issuingBody || ""} className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-xs text-slate">Issue date</label>
        <input type="date" name="issueDate" defaultValue={doc.issueDate ? new Date(doc.issueDate).toISOString().split("T")[0] : ""} className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div>
        <label className="text-xs text-slate">Expiry date</label>
        <input type="date" name="expiryDate" defaultValue={doc.expiryDate ? new Date(doc.expiryDate).toISOString().split("T")[0] : ""} className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div className="col-span-2">
        <label className="text-xs text-slate">Notes</label>
        <input name="notes" defaultValue={doc.notes || ""} className="mt-1 w-full border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
      </div>
      <div className="col-span-2">
        <label className="text-xs text-slate">Replace uploaded document (optional)</label>
        <input type="file" name="file" accept="application/pdf,image/*" className="mt-1 w-full text-sm" />
      </div>
      <button type="submit" className="col-span-2 bg-ink text-white px-4 py-1.5 rounded-full text-xs font-medium hover:bg-signal transition-colors w-fit">
        Save
      </button>
    </form>
  );
}

function AddDocumentForm({ propertyId }: { propertyId: string }) {
  return (
    <details className="mt-4 bg-white border border-line rounded-xl p-4">
        <summary className="text-sm text-slate cursor-pointer hover:text-ink">+ Add compliance document</summary>
        <form action={addComplianceDocument} className="mt-4 grid grid-cols-2 gap-3 max-w-lg">
          <input type="hidden" name="propertyId" value={propertyId} />
          <DocumentDateFields />
          <div className="col-span-2">
            <label className="text-sm text-slate">If "Other", what is it? (optional)</label>
            <input name="otherTypeLabel" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div className="col-span-2">
            <label className="text-sm text-slate">Notes (optional)</label>
            <input name="notes" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <button type="submit" className="col-span-2 bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity w-fit">
            Add document
          </button>
        </form>
      </details>
  );
}
