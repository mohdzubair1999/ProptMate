import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { deleteComplianceDocument } from "@/lib/actions/compliance";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import SearchFilterBar from "@/components/SearchFilterBar";
import { TYPE_LABELS, DOCUMENT_DEFAULTS } from "@/lib/complianceDocumentTypes";
import AddComplianceDocumentForm from "./add-document-form";

function getStatus(expiryDate: Date | null, type: string): { label: string; className: string } {
  if (!expiryDate) return { label: "No expiry tracked", className: "bg-slate/10 text-slate" };
  const warnDays = DOCUMENT_DEFAULTS[type]?.warnDays ?? 60;
  const daysUntil = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return { label: "Expired", className: "bg-red-100 text-red-700" };
  if (daysUntil <= warnDays) return { label: "Expiring soon", className: "bg-signal/10 text-signal" };
  return { label: "Valid", className: "bg-verified/10 text-verified" };
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; status?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;

  const q = params.q?.trim();
  const type = params.type;
  const statusFilter = params.status;

  const properties = companyId
    ? await prisma.property.findMany({
        where: { companyId },
        select: { id: true, address: true },
        orderBy: { address: "asc" },
      })
    : [];

  const allDocuments = companyId
    ? await prisma.complianceDocument.findMany({
        where: {
          property: { companyId },
          ...(type ? { type: type as any } : {}),
          ...(q
            ? {
                OR: [
                  { property: { address: { contains: q, mode: "insensitive" } } },
                  { certificateNumber: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        include: { property: { select: { id: true, address: true } } },
        orderBy: { expiryDate: "asc" },
      })
    : [];

  // Same "only show the current one per type per property" logic as the property page —
  // otherwise years of renewed certificates would clutter this list just as badly.
  const currentByPropertyAndType = new Map<string, (typeof allDocuments)[number]>();
  for (const doc of allDocuments) {
    const key = `${doc.propertyId}:${doc.type === "OTHER" ? doc.otherTypeLabel : doc.type}`;
    const existing = currentByPropertyAndType.get(key);
    const docTime = doc.expiryDate ? new Date(doc.expiryDate).getTime() : -Infinity;
    const existingTime = existing?.expiryDate ? new Date(existing.expiryDate).getTime() : -Infinity;
    if (!existing || docTime > existingTime) currentByPropertyAndType.set(key, doc);
  }

  let documents = Array.from(currentByPropertyAndType.values());

  if (statusFilter) {
    documents = documents.filter((d) => getStatus(d.expiryDate, d.type).label.toLowerCase().replace(" ", "-") === statusFilter);
  }

  documents.sort((a, b) => {
    const aTime = a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity;
    const bTime = b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity;
    return aTime - bTime;
  });

  const expiredCount = documents.filter((d) => getStatus(d.expiryDate, d.type).label === "Expired").length;
  const expiringSoonCount = documents.filter((d) => getStatus(d.expiryDate, d.type).label === "Expiring soon").length;

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">Compliance</h1>
          <p className="text-sm text-slate mt-1">
            {documents.length} document{documents.length === 1 ? "" : "s"} tracked across your portfolio
            {expiredCount > 0 && <span className="text-red-600 font-medium"> · {expiredCount} expired</span>}
            {expiringSoonCount > 0 && <span className="text-signal font-medium"> · {expiringSoonCount} expiring soon</span>}
          </p>
        </div>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by property address or certificate number..."
        filters={[
          {
            param: "type",
            label: "All document types",
            options: Object.entries(TYPE_LABELS)
              .filter(([value]) => value !== "OTHER")
              .map(([value, label]) => ({ value, label })),
          },
          {
            param: "status",
            label: "All statuses",
            options: [
              { value: "valid", label: "Valid" },
              { value: "expiring-soon", label: "Expiring soon" },
              { value: "expired", label: "Expired" },
            ],
          },
        ]}
      />

      <details className="mt-4 bg-white border border-line rounded-xl p-4">
        <summary className="text-sm text-slate cursor-pointer hover:text-ink">+ Add compliance document</summary>
        <AddComplianceDocumentForm properties={properties} />
      </details>

      {documents.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No compliance documents match your search.</p>
        </section>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate">
                <th className="px-6 py-3 font-medium">Property</th>
                <th className="px-6 py-3 font-medium">Document</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Expiry</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => {
                const status = getStatus(doc.expiryDate, doc.type);
                const docLabel = doc.type === "OTHER" ? doc.otherTypeLabel || "Other" : TYPE_LABELS[doc.type];
                return (
                  <tr key={doc.id} className="border-b border-line last:border-0 hover:bg-paper transition-colors">
                    <td className="px-6 py-4 text-slate">{doc.property.address}</td>
                    <td className="px-6 py-4">
                      {doc.documentUrl ? (
                        <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="text-ink font-medium hover:text-signal">
                          {docLabel}
                        </a>
                      ) : (
                        <span className="text-ink font-medium">{docLabel}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full ${status.className}`}>{status.label}</span>
                    </td>
                    <td className="px-6 py-4 text-slate">{doc.expiryDate ? new Date(doc.expiryDate).toLocaleDateString() : "—"}</td>
                    <td className="px-6 py-4 text-right">
                      <form action={deleteComplianceDocument}>
                        <input type="hidden" name="documentId" value={doc.id} />
                        <input type="hidden" name="propertyId" value={doc.property.id} />
                        <ConfirmSubmitButton confirmMessage="Delete this compliance document?" className="text-xs text-red-600 hover:text-red-700 underline">
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </main>
  );
}
