import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import SearchFilterBar from "@/components/SearchFilterBar";
import QuickFilterChips from "@/components/QuickFilterChips";
import DateRangeFilter from "@/components/DateRangeFilter";

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    inspector?: string;
    sort?: string;
    dateFrom?: string;
    dateTo?: string;
    overdue?: string;
    waiting?: string;
    mine?: string;
  }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;
  const currentUserId = session?.user?.id as string | undefined;

  const q = params.q?.trim();
  const type = params.type;
  const status = params.status;
  const inspectorId = params.inspector;
  const sort = params.sort === "oldest" ? "asc" : "desc";
  const isOverdue = params.overdue === "1";
  const isWaiting = params.waiting === "1";
  const isMine = params.mine === "1";

  const staff = companyId
    ? await prisma.user.findMany({
        where: { companyId, role: { in: ["ADMIN", "MANAGER", "INSPECTOR"] } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true },
      })
    : [];

  const dateFilter =
    params.dateFrom || params.dateTo
      ? {
          createdAt: {
            ...(params.dateFrom ? { gte: new Date(params.dateFrom) } : {}),
            ...(params.dateTo ? { lte: new Date(new Date(params.dateTo).getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
          },
        }
      : {};

  const inspections = companyId
    ? await prisma.inspection.findMany({
        where: {
          property: { companyId },
          ...(type ? { type } : {}),
          ...(status ? { status } : {}),
          ...(inspectorId ? { inspectorId } : {}),
          ...(isMine && currentUserId ? { inspectorId: currentUserId } : {}),
          ...(isOverdue ? { status: "draft", scheduledDate: { lt: new Date() } } : {}),
          ...(isWaiting ? { status: "draft", assignedClientId: { not: null } } : {}),
          ...dateFilter,
          ...(q ? { property: { companyId, address: { contains: q, mode: "insensitive" } } } : {}),
        },
        orderBy: { createdAt: sort },
        include: { property: true, inspector: true, _count: { select: { items: true } } },
      })
    : [];

  const totalCount = companyId ? await prisma.inspection.count({ where: { property: { companyId } } }) : 0;
  const isFiltered = !!(q || type || status || inspectorId || isOverdue || isWaiting || isMine || params.dateFrom || params.dateTo);

  return (
    <main>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">Inspections</h1>
          <p className="text-sm text-slate mt-1">
            {isFiltered ? `${inspections.length} of ${totalCount}` : `${totalCount} total`}
          </p>
        </div>
        <Link href="/dashboard/inspections/new" className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
          New inspection
        </Link>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by property address..."
        filters={[
          {
            param: "type",
            label: "All types",
            options: [
              { value: "check-in", label: "Check-in" },
              { value: "check-out", label: "Check-out" },
              { value: "mid-term", label: "Mid-term" },
              { value: "hmo", label: "HMO" },
              { value: "legionella", label: "Legionella" },
              { value: "maintenance", label: "Maintenance" },
            ],
          },
          {
            param: "status",
            label: "All statuses",
            options: [
              { value: "draft", label: "Draft" },
              { value: "completed", label: "Completed" },
            ],
          },
          {
            param: "inspector",
            label: "All inspectors",
            options: staff.map((s) => ({ value: s.id, label: s.name || s.email })),
          },
          {
            param: "sort",
            label: "Newest first",
            options: [{ value: "oldest", label: "Oldest first" }],
          },
        ]}
      />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <QuickFilterChips
          chips={[
            { param: "overdue", label: "⏰ Overdue" },
            { param: "waiting", label: "⏳ Waiting on tenant/landlord" },
            { param: "mine", label: "👤 My inspections" },
          ]}
        />
        <DateRangeFilter />
      </div>

      {totalCount === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-verified/10 text-verified flex items-center justify-center mx-auto">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="4" width="14" height="17" rx="1" />
              <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <p className="font-display font-600 text-ink mt-4">No inspections yet</p>
          <p className="text-slate text-sm mt-1">Start your first one whenever you're ready.</p>
          <Link href="/dashboard/inspections/new" className="inline-block mt-5 bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            + Start your first inspection
          </Link>
        </section>
      ) : inspections.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No inspections match your search — try adjusting your filters.</p>
        </section>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate">
                <th className="px-6 py-3 font-medium">Property</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Inspector</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0 hover:bg-paper transition-colors">
                  <td className="px-6 py-4">
                    <Link href={`/dashboard/inspections/${i.id}`} className="text-ink font-medium hover:text-signal">
                      {i.property.address}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate capitalize">{i.type}</td>
                  <td className="px-6 py-4 text-slate">{i.inspector.name || i.inspector.email}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${i.status === "completed" ? "bg-verified/10 text-verified" : "bg-signal/10 text-signal"}`}>
                      {i.status}
                    </span>
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
