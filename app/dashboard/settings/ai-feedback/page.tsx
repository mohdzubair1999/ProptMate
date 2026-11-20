import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { MISS_KIND_LABELS, MISS_KINDS, pickMissKind, missSummary } from "@/lib/aiFeedback";
import { loadAiUsage } from "@/lib/aiUsage";

export const metadata = { title: "AI misses" };

export default async function AiFeedbackPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const user = session.user as { role?: string; companyId?: string | null };
  const back = <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">← Settings</Link>;
  if (!user.companyId || (user.role !== "ADMIN" && user.role !== "MANAGER")) {
    return <div>{back}<h1 className="font-display font-700 text-2xl text-ink mt-2">AI misses</h1><p className="text-sm text-slate mt-2" data-testid="misses-denied">Only an Admin or Manager can see this page.</p></div>;
  }
  const rows = await prisma.aiMissReport.findMany({ where: { companyId: user.companyId }, orderBy: { createdAt: "desc" }, take: 100 });
  // the last 30 days: reports against photo analyses, so it is a rate and not only a count
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recent = await prisma.aiMissReport.findMany({ where: { companyId: user.companyId, createdAt: { gte: since } }, select: { kind: true }, take: 5000 });
  const usage = await loadAiUsage(user.companyId, 30);
  const sum = missSummary(recent, usage.filter((u) => u.feature.startsWith("analyze-photo")).reduce((n, u) => n + u.requests, 0));
  return (
    <div>
      {back}
      <h1 className="font-display font-700 text-2xl text-ink mt-2">AI misses</h1>
      <p className="text-sm text-slate mt-1 max-w-2xl">Things your team said the photo analysis left out. Send a batch of these to be used to improve the analysis.</p>
      <div className="mt-6 bg-white border border-line rounded-xl p-5 text-sm" data-testid="miss-summary">
        <p className="text-ink">Last 30 days: <span className="font-medium">{sum.reports}</span> reported against <span className="font-medium">{sum.analyses}</span> photo analyses{sum.per100 !== null && <> (<span className="font-medium">{sum.per100}</span> per 100)</>}.</p>
        {sum.reports > 0 && <p className="text-xs text-slate mt-1">{MISS_KINDS.filter((k) => sum.byKind[k] > 0).map((k) => `${MISS_KIND_LABELS[k]}: ${sum.byKind[k]}`).join(" · ")}</p>}
        <p className="text-xs text-slate mt-1">Only misses someone chose to report are counted, so treat this as a floor, not the true figure.</p>
      </div>
      {rows.length === 0 ? (
        <p className="mt-6 bg-white border border-line rounded-xl p-6 text-sm text-slate" data-testid="misses-empty">Nothing reported yet. Use &quot;The AI missed something?&quot; under an analysis result.</p>
      ) : (
        <ul className="mt-6 space-y-2" data-testid="misses-list">
          {rows.map((r) => (
            <li key={r.id} className="bg-white border border-line rounded-xl p-4 text-sm">
              <p className="text-ink whitespace-pre-wrap">{r.note}</p>
              <p className="text-xs text-slate mt-1">{MISS_KIND_LABELS[pickMissKind(r.kind)]} · {r.mode === "detailed" ? "Detailed" : "Quick"} · {r.userEmail} · {r.createdAt.toLocaleDateString("en-GB")}
                {r.inspectionId && <> · <Link href={`/dashboard/inspections/${r.inspectionId}`} className="underline">inspection</Link></>}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
