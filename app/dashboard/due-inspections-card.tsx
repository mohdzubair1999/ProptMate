import Link from "next/link";
import { loadDueInspections, describeDueRow } from "@/lib/dueInspections";

const SHOWN = 6;

// "Inspections due" on the dashboard: overdue, never inspected (with a schedule set) and due within a month. Shows nothing when there is
// nothing to do, so the dashboard stays quiet.
export default async function DueInspectionsCard({ companyId }: { companyId: string | null }) {
  const rows = await loadDueInspections(companyId);
  if (rows.length === 0) return null;
  const shown = rows.slice(0, SHOWN);
  const overdue = rows.filter((r) => r.kind === "overdue").length;
  return (
    <section className="mb-6" data-testid="due-inspections">
      <h2 className="font-display font-600 text-ink">
        Inspections due{overdue > 0 ? <span className="ml-2 text-xs font-medium text-red-700" data-testid="due-overdue-count">{overdue} overdue</span> : null}
      </h2>
      <div className="mt-2 bg-white border border-line rounded-xl divide-y divide-line">
        {shown.map((r) => (
          <Link key={r.id} href={`/dashboard/properties/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-paper" data-testid="due-row">
            <span className="text-ink truncate">{r.address}</span>
            <span className={`shrink-0 text-xs font-medium ${r.kind === "overdue" ? "text-red-700" : r.kind === "never" ? "text-amber-800" : "text-slate"}`}>{describeDueRow(r)}</span>
          </Link>
        ))}
      </div>
      {rows.length > SHOWN && (
        <Link href="/dashboard/properties" className="inline-block mt-2 text-xs text-signal underline" data-testid="due-more">
          and {rows.length - SHOWN} more: see all properties
        </Link>
      )}
    </section>
  );
}
