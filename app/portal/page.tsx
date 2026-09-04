import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function PortalHome() {
  const session = await getSession();
  const userId = session!.user.id as string;

  const access = await prisma.propertyAccess.findMany({
    where: { userId },
    include: { property: true },
  });

  const assignedInspections = await prisma.inspection.findMany({
    where: { assignedClientId: userId, deletedAt: null },
    include: { property: true },
    orderBy: { createdAt: "desc" },
  });

  const pending = assignedInspections.filter((i) => i.status === "draft");
  const completed = assignedInspections.filter((i) => i.status === "completed");

  return (
    <div>
      <h1 className="font-display font-700 text-2xl text-ink">Welcome</h1>
      <p className="text-sm text-slate mt-1">Your properties and any forms waiting for you to complete.</p>

      {access.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display font-600 text-lg text-ink mb-3">Your properties</h2>
          <div className="space-y-2">
            {access.map((a) => (
              <div key={a.id} className="bg-white border border-line rounded-xl p-4">
                <p className="text-sm font-medium text-ink">{a.property.address}</p>
                <p className="text-xs text-slate mt-0.5 capitalize">{a.relation.toLowerCase()}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="font-display font-600 text-lg text-ink mb-3">Forms to complete</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate">Nothing waiting for you right now.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((i) => (
              <Link
                key={i.id}
                href={`/portal/inspections/${i.id}`}
                className="block bg-white border border-line rounded-xl p-4 hover:border-signal transition-colors"
              >
                <p className="text-sm font-medium text-ink capitalize">{i.type.replace("-", " ")}</p>
                <p className="text-xs text-slate mt-0.5">{i.property.address}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {completed.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display font-600 text-lg text-ink mb-3">Completed</h2>
          <div className="space-y-2">
            {completed.map((i) => (
              <Link
                key={i.id}
                href={`/portal/inspections/${i.id}`}
                className="block bg-white border border-line rounded-xl p-4 opacity-70 hover:opacity-100 transition-opacity"
              >
                <p className="text-sm font-medium text-ink capitalize">{i.type.replace("-", " ")}</p>
                <p className="text-xs text-slate mt-0.5">{i.property.address} · Completed</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
