import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { blockIp, unblockIp } from "@/lib/actions/security";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  low: "bg-slate/10 text-slate",
};

export default async function SecurityDashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  if ((session.user as any).role !== "ADMIN") {
    return (
      <main>
        <p className="text-sm text-slate">Only an Admin can view this page.</p>
      </main>
    );
  }

  const [events, blockedIps] = await Promise.all([
    prisma.securityEvent.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.blockedIp.findMany({ orderBy: { createdAt: "desc" } }),
  ]);

  const blockedSet = new Set(blockedIps.map((b) => b.ipAddress));

  return (
    <main>
      <h1 className="font-display font-700 text-2xl text-ink">Security</h1>
      <p className="text-sm text-slate mt-1">
        Activity detected on the app's public-facing endpoints - the QR report form, its photo upload, and the integrations webhook. A repeated pattern from one source triggers an
        immediate email alert; anything logged here is worth a glance either way.
      </p>

      <h2 className="font-display font-600 text-lg text-ink mt-8">Blocked IPs</h2>
      {blockedIps.length === 0 ? (
        <p className="text-sm text-slate mt-2">No IPs currently blocked.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {blockedIps.map((b) => (
            <div key={b.id} className="bg-white border border-line rounded-xl p-4 flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-sm font-mono text-ink">{b.ipAddress}</p>
                <p className="text-xs text-slate mt-0.5">{b.reason}</p>
              </div>
              <form action={unblockIp}>
                <input type="hidden" name="ipAddress" value={b.ipAddress} />
                <button type="submit" className="text-xs text-signal hover:underline">
                  Unblock
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-display font-600 text-lg text-ink mt-8">Recent events</h2>
      {events.length === 0 ? (
        <p className="text-sm text-slate mt-2">No security events logged yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {events.map((e) => (
            <div key={e.id} className="bg-white border border-line rounded-xl p-4">
              <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${SEVERITY_STYLES[e.severity] || SEVERITY_STYLES.low}`}>{e.severity}</span>
                  <span className="text-xs text-slate ml-2">{e.type.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-slate">{new Date(e.createdAt).toLocaleString("en-GB")}</p>
              </div>
              <p className="text-sm text-ink mt-2">{e.details}</p>
              <p className="text-xs text-slate mt-1 font-mono">
                {e.ipAddress} · {e.endpoint}
              </p>
              {e.ipAddress !== "unknown" && (
                <div className="mt-2">
                  {blockedSet.has(e.ipAddress) ? (
                    <span className="text-xs text-red-600">Already blocked</span>
                  ) : (
                    <form action={blockIp}>
                      <input type="hidden" name="ipAddress" value={e.ipAddress} />
                      <input type="hidden" name="reason" value={`${e.type.replace(/_/g, " ")} on ${e.endpoint}`} />
                      <ConfirmSubmitButton confirmMessage={`Block ${e.ipAddress}? This will stop them reaching any public endpoint immediately.`} className="text-xs text-red-600 hover:underline">
                        Block this IP
                      </ConfirmSubmitButton>
                    </form>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
