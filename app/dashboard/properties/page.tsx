import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { deleteProperty } from "@/lib/actions/properties";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import SearchFilterBar from "@/components/SearchFilterBar";
import QuickFilterChips from "@/components/QuickFilterChips";
import { TYPE_LABELS, DOCUMENT_DEFAULTS } from "@/lib/complianceDocumentTypes";

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

function computeNextInspection(
  inspections: { status: string; completedDate: Date | null; scheduledDate: Date | null }[],
  frequencyMonths: number | null
): { label: string; date: Date | null; urgent?: boolean } | null {
  if (inspections.length === 0) {
    // No inspections at all — either brand new, or every past one got deleted. A frequency
    // being set means someone DOES expect this property to be inspected regularly, so this
    // needs to be visible and actionable, not a silent blank.
    return frequencyMonths ? { label: "Never inspected — schedule now", date: null, urgent: true } : null;
  }
  const latest = inspections[0];

  // If the most recent inspection hasn't been completed yet, that IS the next one — show it
  // directly rather than computing a guess.
  if (latest.status !== "completed") {
    return latest.scheduledDate ? { label: "Scheduled", date: latest.scheduledDate } : { label: "In progress", date: null };
  }

  // Otherwise, only suggest a due date if a recurring frequency is actually set.
  if (!frequencyMonths || !latest.completedDate) return null;
  return { label: "Due", date: addMonthsClamped(latest.completedDate, frequencyMonths) };
}

// Plain setMonth() overflows into the next month when the target month is shorter (e.g. Jan
// 31 + 1 month becomes Mar 3, not Feb 28) — this clamps to the target month's actual last day.
function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonthIndex = d.getMonth() + months;
  const firstOfTargetMonth = new Date(d.getFullYear(), targetMonthIndex, 1);
  const daysInTargetMonth = new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth() + 1, 0).getDate();
  firstOfTargetMonth.setDate(Math.min(d.getDate(), daysInTargetMonth));
  return firstOfTargetMonth;
}

export default async function PropertiesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; landlord?: string; sort?: string; neverInspected?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;

  const q = params.q?.trim();
  const type = params.type;
  const landlord = params.landlord;
  const sort = params.sort === "oldest" ? "asc" : "desc";
  const neverInspected = params.neverInspected === "1";

  const landlordRows = companyId
    ? await prisma.property.findMany({
        where: { companyId, landlordName: { not: null } },
        distinct: ["landlordName"],
        select: { landlordName: true },
        orderBy: { landlordName: "asc" },
      })
    : [];

  const properties = companyId
    ? await prisma.property.findMany({
        where: {
          companyId,
          ...(type ? { type } : {}),
          ...(landlord ? { landlordName: landlord } : {}),
          ...(neverInspected ? { inspections: { none: {} } } : {}),
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
          _count: { select: { inspections: true } },
          inspections: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { status: true, completedDate: true, scheduledDate: true, createdAt: true },
          },
          complianceDocuments: {
            select: { type: true, otherTypeLabel: true, expiryDate: true },
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

  const totalCount = companyId ? await prisma.property.count({ where: { companyId } }) : 0;
  const isFiltered = !!(q || type || landlord || neverInspected);

  return (
    <main>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">Properties</h1>
          <p className="text-sm text-slate mt-1">
            {isFiltered ? `${properties.length} of ${totalCount}` : `${totalCount} total`}
          </p>
        </div>
        <Link href="/dashboard/properties/new" className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
          Add property
        </Link>
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
            label: "All landlords",
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
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No properties yet — add your first one to get started.</p>
        </section>
      ) : properties.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No properties match your search.</p>
        </section>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate">
                <th className="px-6 py-3 font-medium">Address</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Landlord</th>
                <th className="px-6 py-3 font-medium">Inspections</th>
                <th className="px-6 py-3 font-medium">Last inspected</th>
                <th className="px-6 py-3 font-medium">Next inspection</th>
                <th className="px-6 py-3 font-medium">Licence</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr key={p.id} className="relative border-b border-line last:border-0 hover:bg-paper transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/properties/${p.id}`} className="text-ink font-medium hover:text-signal after:absolute after:inset-0">
                      {p.address}
                    </Link>
                    {(p.city || p.postcode) && (
                      <p className="text-xs text-slate mt-0.5">{[p.city, p.postcode].filter(Boolean).join(", ")}</p>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate capitalize">{p.type}</td>
                  <td className="px-6 py-4 text-slate">{p.landlordName || "—"}</td>
                  <td className="px-6 py-4 text-slate">{p._count.inspections}</td>
                  <td className="px-6 py-4 text-slate">
                    {p.inspections.length === 0 ? (
                      "Never"
                    ) : p.inspections[0].status === "completed" && p.inspections[0].completedDate ? (
                      new Date(p.inspections[0].completedDate).toLocaleDateString()
                    ) : p.inspections[0].scheduledDate ? (
                      `Scheduled ${new Date(p.inspections[0].scheduledDate).toLocaleDateString()}`
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
                          {next.label} {next.date.toLocaleDateString()}
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
                  <td className="px-6 py-4 text-right">
                    <form action={deleteProperty}>
                      <input type="hidden" name="propertyId" value={p.id} />
                      <ConfirmSubmitButton
                        confirmMessage={`Permanently delete "${p.address}" and all ${p._count.inspections} inspection(s) under it? This cannot be undone.`}
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
