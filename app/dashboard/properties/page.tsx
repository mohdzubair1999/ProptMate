import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import { deleteProperty, archiveProperty, restoreProperty, archiveProperties, restoreProperties } from "@/lib/actions/properties";
import { propertyLimitFor } from "@/lib/planLimits";
import SelectAllCheckbox from "@/components/SelectAllCheckbox";
import PlanUsageBanner from "@/components/PlanUsageBanner";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import { computeNextInspection } from "@/lib/inspectionScheduling";
import SearchFilterBar from "@/components/SearchFilterBar";
import QuickFilterChips from "@/components/QuickFilterChips";
import { TYPE_LABELS, DOCUMENT_DEFAULTS } from "@/lib/complianceDocumentTypes";
import { calculatePropertyHealthScore } from "@/lib/propertyHealthScore";
import { formatPropertyType } from "@/lib/propertyType";

function getComplianceStatus(expiryDate: Date | null, type: string): { label: string; className: string } {
  if (!expiryDate) return { label: "—", className: "text-slate" };
  const warnDays = DOCUMENT_DEFAULTS[type]?.warnDays ?? 60;
  const daysUntil = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (daysUntil < 0) return { label: "Expired", className: "text-red-600 font-medium" };
  if (daysUntil <= warnDays) return { label: "Expiring soon", className: "text-signal font-medium" };
  return { label: "Valid", className: "text-verified" };
}

// A property almost never needs both an HMO licence and a selective licence at once — it's
// one or the other (or neither) — so this picks whichever one actually exists rather than
// showing two mostly-empty columns for the two licence types.
function getLicenceInfo(documents: { type: string; expiryDate: Date | null }[]) {
  const licenceDocs = documents.filter((d) => d.type === "HMO_LICENCE" || d.type === "SELECTIVE_LICENCE");
  if (licenceDocs.length === 0) return null;

  const current = licenceDocs.reduce((latest, doc) => {
    const docTime = doc.expiryDate ? new Date(doc.expiryDate).getTime() : -Infinity;
    const latestTime = latest.expiryDate ? new Date(latest.expiryDate).getTime() : -Infinity;
    return docTime > latestTime ? doc : latest;
  });

  return { type: current.type, label: TYPE_LABELS[current.type], status: getComplianceStatus(current.expiryDate, current.type) };
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; landlord?: string; sort?: string; neverInspected?: string; archived?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;

  const q = params.q?.trim();
  const type = params.type;
  const landlord = params.landlord;
  const sort = params.sort === "oldest" ? "asc" : "desc";
  const neverInspected = params.neverInspected === "1";
  const showArchived = params.archived === "1"; // archived properties are kept, but only shown when asked for
  const archivedFilter = showArchived ? { archivedAt: { not: null } } : { archivedAt: null };

  const landlordRows = companyId
    ? await prisma.property.findMany({
        where: { companyId, ...archivedFilter, landlordName: { not: null } },
        distinct: ["landlordName"],
        select: { landlordName: true },
        orderBy: { landlordName: "asc" },
      })
    : [];

  const properties = companyId
    ? await prisma.property.findMany({
        where: {
          companyId,
          ...archivedFilter,
          ...(type ? { type } : {}),
          ...(landlord ? { landlordName: landlord } : {}),
          ...(neverInspected ? { inspections: { none: { deletedAt: null } } } : {}),
          ...(q
            ? {
                OR: [
                  { address: { contains: q, mode: "insensitive" } },
                  { city: { contains: q, mode: "insensitive" } },
                  { postcode: { contains: q, mode: "insensitive" } },
                  { landlordName: { contains: q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: sort },
        include: {
          _count: { select: { inspections: { where: { deletedAt: null } } } },
          inspections: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
              completedDate: true,
              scheduledDate: true,
              createdAt: true,
              items: { select: { condition: true } },
            },
          },
          complianceDocuments: {
            select: { type: true, otherTypeLabel: true, expiryDate: true },
          },
          qrIssueReports: {
            where: { status: { not: "resolved" } },
            select: { id: true },
          },
        },
      })
    : [];

  // "Most urgent first" isn't a real database column — it's computed from frequency + last
  // inspection, so this has to be a JS sort after fetching, not part of the Prisma query.
  if (params.sort === "urgent") {
    properties.sort((a, b) => {
      const nextA = computeNextInspection(a.inspections, a.inspectionFrequencyMonths);
      const nextB = computeNextInspection(b.inspections, b.inspectionFrequencyMonths);
      const scoreA = nextA?.urgent ? -Infinity : nextA?.date ? nextA.date.getTime() : Infinity;
      const scoreB = nextB?.urgent ? -Infinity : nextB?.date ? nextB.date.getTime() : Infinity;
      return scoreA - scoreB;
    });
  }

  const totalCount = companyId ? await prisma.property.count({ where: { companyId, ...archivedFilter } }) : 0;
  const [activeCount, archivedCount, planTier] = companyId
    ? await Promise.all([
        showArchived ? prisma.property.count({ where: { companyId, archivedAt: null } }) : Promise.resolve(totalCount),
        showArchived ? Promise.resolve(totalCount) : prisma.property.count({ where: { companyId, archivedAt: { not: null } } }),
        prisma.company.findUnique({ where: { id: companyId }, select: { planTier: true } }).then((c) => c?.planTier ?? null),
      ])
    : [0, 0, null];
  const planLimit = propertyLimitFor(planTier);
  const isFiltered = !!(q || type || landlord || neverInspected);

  return (
    <main>
      {!showArchived && <PlanUsageBanner companyId={companyId} />}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">Properties</h1>
          <p className="text-sm text-slate mt-1">
            {showArchived ? "Archived: kept for your records, not counted against your plan. " : ""}{isFiltered ? `${properties.length} of ${totalCount}` : `${totalCount} ${showArchived ? "archived" : "total"}`}
            {planLimit !== null && <span data-testid="plan-usage">{` · ${activeCount} of ${planLimit} on your plan`}</span>}
          </p>
          {showArchived ? (
            <Link href="/dashboard/properties" className="text-xs text-slate underline hover:text-ink" data-testid="view-active">Back to active properties</Link>
          ) : archivedCount > 0 ? (
            <Link href="/dashboard/properties?archived=1" className="text-xs text-slate underline hover:text-ink" data-testid="view-archived">{`Archived (${archivedCount})`}</Link>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/properties/import" className="text-sm text-slate underline hover:text-ink" data-testid="import-link">Import from spreadsheet</Link>
          <Link href="/dashboard/properties/new" className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            Add property
          </Link>
        </div>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search address, city, postcode, or landlord..."
        filters={[
          {
            param: "type",
            label: "All types",
            options: [
              { value: "flat", label: "Flat / Apartment" },
              { value: "house", label: "House" },
              { value: "studio", label: "Studio" },
              { value: "room", label: "Room" },
              { value: "hmo", label: "HMO" },
              { value: "commercial", label: "Commercial" },
            ],
          },
          {
            param: "landlord",
            label: "All clients",
            options: landlordRows.map((l) => ({ value: l.landlordName!, label: l.landlordName! })),
          },
          {
            param: "sort",
            label: "Newest first",
            options: [
              { value: "oldest", label: "Oldest first" },
              { value: "urgent", label: "Most urgent first" },
            ],
          },
        ]}
      />

      <QuickFilterChips chips={[{ param: "neverInspected", label: "🔍 Never inspected" }]} />

      {totalCount === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-signal/10 text-signal flex items-center justify-center mx-auto">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="1" />
              <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 21v-4h6v4" />
            </svg>
          </div>
          <p className="font-display font-600 text-ink mt-4">No properties yet</p>
          <p className="text-slate text-sm mt-1">Add your first one to start tracking inspections and compliance.</p>
          <Link href="/dashboard/properties/new" className="inline-block mt-5 bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            + Add your first property
          </Link>
        </section>
      ) : properties.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No properties match your search — try adjusting your filters.</p>
        </section>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="text-left px-6 py-3 border-b border-line">
              <form id="bulk-form" action={showArchived ? restoreProperties : archiveProperties} className="inline">
                <ConfirmSubmitButton
                  confirmMessage={showArchived ? "Restore the ticked properties? Each one uses a place on your plan again." : "Archive the ticked properties? Their history is kept, but they are hidden from your lists, stop sending reminders and free places on your plan. You can restore them later."}
                  className="text-xs border border-line rounded-full px-3 py-1 text-ink hover:border-ink"
                >
                  {showArchived ? "Restore ticked" : "Archive ticked"}
                </ConfirmSubmitButton>
                <span className="text-xs text-slate ml-2">Tick properties in the list first.</span>
              </form>
            </caption>
            <thead>
              <tr className="border-b border-line text-left text-slate">
                <th className="px-3 py-3 w-8"><SelectAllCheckbox formId="bulk-form" /></th>
                <th className="px-6 py-3 font-medium">Address</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Client</th>
                <th className="px-6 py-3 font-medium">Inspections</th>
                <th className="px-6 py-3 font-medium">Last inspected</th>
                <th className="px-6 py-3 font-medium">Next inspection</th>
                <th className="px-6 py-3 font-medium">Licence</th>
                <th className="px-6 py-3 font-medium">Health</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-paper transition-colors">
                  <td className="px-3 py-4"><input type="checkbox" name="propertyIds" value={p.id} form="bulk-form" aria-label={`Select ${p.address}`} data-bulk-row /></td>
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/properties/${p.id}`} className="text-ink font-medium hover:text-signal">
                      {p.address}
                    </Link>
                    {(p.city || p.postcode) && (
                      <p className="text-xs text-slate mt-0.5">{[p.city, p.postcode].filter(Boolean).join(", ")}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate">{formatPropertyType(p.type) || "—"}</td>
                  <td className="px-6 py-4 text-slate">{p.landlordName || "—"}</td>
                  <td className="px-6 py-4 text-slate">{p._count.inspections}</td>
                  <td className="px-6 py-4 text-slate">
                    {p.inspections.length === 0 ? (
                      "Never"
                    ) : p.inspections[0].status === "completed" && p.inspections[0].completedDate ? (
                      formatDate(p.inspections[0].completedDate)
                    ) : p.inspections[0].scheduledDate ? (
                      `Scheduled ${formatDate(p.inspections[0].scheduledDate)}`
                    ) : (
                      "In progress"
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const next = computeNextInspection(p.inspections, p.inspectionFrequencyMonths);
                      if (!next) return <span className="text-slate">—</span>;
                      if (next.urgent) return <span className="text-red-600 font-medium">⚠️ {next.label}</span>;
                      if (!next.date) return <span className="text-slate">{next.label}</span>;
                      const isOverdue = next.date < new Date();
                      return (
                        <span className={isOverdue ? "text-red-600 font-medium" : "text-slate"}>
                          {next.label} {formatDate(next.date)}
                          {isOverdue && " ⚠️"}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const licence = getLicenceInfo(p.complianceDocuments);
                      if (!licence) return <span className="text-slate">—</span>;
                      return (
                        <span className={licence.status.className}>
                          {licence.label.replace(" Licence", "")} · {licence.status.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const result = calculatePropertyHealthScore({
                        itemConditions: p.inspections[0]?.items.map((i) => i.condition).filter((c): c is string => !!c) || [],
                        complianceExpiryDates: p.complianceDocuments.map((d) => d.expiryDate),
                        openIssueCount: p.qrIssueReports.length,
                      });
                      const bandStyle = result.band === "good" ? "text-verified" : result.band === "fair" ? "text-signal" : "text-red-600 font-medium";
                      return (
                        <Link href={`/dashboard/properties/${p.id}`} className={bandStyle}>
                          {result.score}
                        </Link>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <form action={showArchived ? restoreProperty : archiveProperty} className="inline mr-3">
                      <input type="hidden" name="propertyId" value={p.id} />
                      <ConfirmSubmitButton
                        confirmMessage={showArchived ? `Restore "${p.address}"? It will use one place on your plan again.` : `Archive "${p.address}"? Its history is kept, but it is hidden from your lists, stops sending reminders and frees a place on your plan. You can restore it later.`}
                        className="text-xs text-slate hover:text-ink underline"
                      >
                        {showArchived ? "Restore" : "Archive"}
                      </ConfirmSubmitButton>
                    </form>
                    <form action={deleteProperty} className="inline">
                      <input type="hidden" name="propertyId" value={p.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Permanently delete "${p.address}" and every inspection under it, including any in Recently Deleted (${p._count.inspections} current)? This cannot be undone.`}
                        className="text-xs text-red-600 hover:text-red-700 underline"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </main>
  );
}
