import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { loadAiUsage, summariseUsage, ukDay } from "@/lib/aiUsage";

export const metadata = { title: "AI usage" };
const DAYS = 30;
const DETAILED_DAILY_LIMIT = 300; // the company's daily ceiling for detailed photo analysis (kept in step with the analyze-photo route)

export default async function AiUsagePage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const user = session.user as { role?: string; companyId?: string | null };
  const back = <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">← Settings</Link>;
  if (!user.companyId || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return (
      <div>
        {back}
        <h1 className="font-display font-700 text-2xl text-ink mt-2">AI usage</h1>
        <p className="text-sm text-slate mt-2" data-testid="usage-denied">Only an Admin or Manager can see this page.</p>
      </div>
    );
  }
  const rows = await loadAiUsage(user.companyId, DAYS);
  const s = summariseUsage(rows, DAYS);
  const peak = Math.max(1, ...s.byDay.map((d) => d.requests));
  const today = ukDay();
  const detailedToday = rows.filter((r) => r.day === today && r.feature === "analyze-photo-detailed").reduce((n, r) => n + r.requests, 0);
  return (
    <div>
      {back}
      <h1 className="font-display font-700 text-2xl text-ink mt-2">AI usage</h1>
      <p className="text-sm text-slate mt-1 max-w-2xl">The last {DAYS} days, for your whole team. This counts how many AI requests were made. It does not show money, because prices change and differ by model, so a figure here would soon be wrong.</p>

      {s.totalRequests === 0 ? (
        <p className="mt-6 bg-white border border-line rounded-xl p-6 text-sm text-slate" data-testid="usage-empty">No AI requests have been counted yet. They appear here from now on.</p>
      ) : (
        <>
          <div className="mt-6 grid sm:grid-cols-3 gap-3" data-testid="usage-totals">
            <div className="bg-white border border-line rounded-xl p-4"><p className="text-xs text-slate">Requests</p><p className="font-display font-700 text-2xl text-ink" data-testid="usage-total-requests">{s.totalRequests}</p></div>
            <div className="bg-white border border-line rounded-xl p-4"><p className="text-xs text-slate">Allowance used</p><p className="font-display font-700 text-2xl text-ink" data-testid="usage-total-units">{s.totalUnits}</p></div>
            <div className="bg-white border border-line rounded-xl p-4"><p className="text-xs text-slate">Busiest day</p><p className="font-display font-700 text-2xl text-ink" data-testid="usage-busiest">{s.busiest ? `${s.busiest.requests}` : "-"}</p>{s.busiest && <p className="text-xs text-slate">{new Date(`${s.busiest.day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" })}</p>}</div>
          </div>

          <h2 className="font-display font-600 text-lg text-ink mt-8">By feature</h2>
          <div className="mt-3 bg-white border border-line rounded-xl overflow-x-auto">
            <table className="w-full text-sm" data-testid="usage-table">
              <thead className="bg-paper text-left text-xs text-slate"><tr><th className="px-4 py-2">Feature</th><th className="px-4 py-2 text-right">Requests</th><th className="px-4 py-2 text-right">Allowance used</th><th className="px-4 py-2">Last used</th></tr></thead>
              <tbody className="divide-y divide-line">
                {s.byFeature.map((f) => (
                  <tr key={f.feature} data-testid="usage-row">
                    <td className="px-4 py-2 text-ink">{f.label}</td>
                    <td className="px-4 py-2 text-right text-ink">{f.requests}</td>
                    <td className="px-4 py-2 text-right text-slate">{f.units}</td>
                    <td className="px-4 py-2 text-slate">{new Date(`${f.lastDay}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate mt-2 max-w-2xl">Allowance used is what counts toward your daily limits: one for most requests, and one per photo for photo analysis (three per photo for Detailed, which does about three times the work). A request is counted when it is allowed to start, even if the AI then could not answer it.</p>

          <h2 className="font-display font-600 text-lg text-ink mt-8">By day</h2>
          <div className="mt-3 bg-white border border-line rounded-xl p-4" data-testid="usage-days">
            <div className="flex items-end gap-1 h-28" role="img" aria-label={`Requests per day over the last ${DAYS} days`}>
              {s.byDay.map((d) => (
                <div key={d.day} className="flex-1 bg-signal/70 rounded-t min-h-[2px]" style={{ height: `${Math.max(2, Math.round((d.requests / peak) * 100))}%`, opacity: d.requests === 0 ? 0.15 : 1 }} title={`${d.day}: ${d.requests} request${d.requests === 1 ? "" : "s"}`} data-day={d.day} data-requests={d.requests} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-slate mt-1"><span>{s.byDay[0]?.day}</span><span>{s.byDay[s.byDay.length - 1]?.day}</span></div>
          </div>

          <p className="text-sm text-slate mt-6" data-testid="usage-detailed-limit">Detailed photo analysis today: {detailedToday} of {DETAILED_DAILY_LIMIT} requests (the daily limit for your whole company).</p>
        </>
      )}
    </div>
  );
}
