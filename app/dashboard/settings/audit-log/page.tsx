import Link from "next/link";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;

const ACTION_COLORS: Record<string, string> = {
  created: "bg-verified/10 text-verified",
  invited: "bg-verified/10 text-verified",
  updated: "bg-signal/10 text-signal",
  reopened: "bg-signal/10 text-signal",
  completed: "bg-verified/10 text-verified",
  deleted: "bg-red-100 text-red-700",
  removed: "bg-red-100 text-red-700",
};

function colorFor(action: string) {
  const suffix = action.split(".")[1] || "";
  return ACTION_COLORS[suffix] || "bg-paper text-slate";
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role as string;
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect("/dashboard/settings");
  }

  const companyId = (session.user as any).companyId as string | null;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const [entries, totalCount] = companyId
    ? await Promise.all([
        prisma.auditLog.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
        }),
        prisma.auditLog.count({ where: { companyId } }),
      ])
    : [[], 0];

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <main>
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>

      <h1 className="font-display font-700 text-2xl text-ink mt-4">Audit log</h1>
      <p className="text-sm text-slate mt-1">Who changed what, when — properties, inspections, compliance documents, and team membership.</p>

      {entries.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">Nothing logged yet — entries will appear here as changes happen.</p>
        </section>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-slate">
                  <th className="px-6 py-3 font-medium">When</th>
                  <th className="px-6 py-3 font-medium">Who</th>
                  <th className="px-6 py-3 font-medium">Action</th>
                  <th className="px-6 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 text-slate whitespace-nowrap">
                      {entry.createdAt.toLocaleDateString("en-GB")} {entry.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-3 text-ink">{entry.userEmail}</td>
                    <td className="px-6 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${colorFor(entry.action)}`}>{entry.action}</span>
                    </td>
                    <td className="px-6 py-3 text-ink">{entry.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {page > 1 && (
            <Link href={`/dashboard/settings/audit-log?page=${page - 1}`} className="text-ink hover:underline">
              ← Newer
            </Link>
          )}
          <span className="text-slate">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/dashboard/settings/audit-log?page=${page + 1}`} className="text-ink hover:underline">
              Older →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
