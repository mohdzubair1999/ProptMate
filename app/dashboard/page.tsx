import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DashboardInstallBanner from "./dashboard-install-banner";
import { formatDate } from "@/lib/formatDate";
import { TYPE_LABELS, getStatus } from "@/lib/complianceDocumentTypes";
import { inspectionTypeDisplayName } from "@/lib/inspectionTypeDisplayNames";
import { calculatePropertyHealthScore } from "@/lib/propertyHealthScore";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// A plain SVG bar sparkline - no charting library, so it can't break the npm ci build the way
// adding a new dependency without a matching, regenerated package-lock.json would. Each bar's
// height is scaled relative to the single busiest day in the range, so the shape of the trend
// is always readable regardless of whether the real numbers are small or large.
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const barWidth = 100 / values.length;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="w-full h-8">
      {values.map((v, i) => {
        const height = Math.max((v / max) * 28, 0.5);
        return (
          <rect
            key={i}
            x={i * barWidth + barWidth * 0.15}
            y={32 - height}
            width={barWidth * 0.7}
            height={height}
            rx={0.5}
            fill="currentColor"
            opacity={i === values.length - 1 ? 1 : 0.35}
          />
        );
      })}
    </svg>
  );
}

export default async function Dashboard() {
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;

  // Falls back to the part of the email before the @ if no display name is set — still
  // feels personal rather than generic, without requiring everyone to fill in a name field.
  const rawName = (session?.user as any)?.name || session?.user?.email?.split("@")[0] || "";
  const firstName = rawName.split(" ")[0].split(/[._]/)[0];
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : "";

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const oneHundredTwentyDaysFromNow = new Date();
  oneHundredTwentyDaysFromNow.setDate(oneHundredTwentyDaysFromNow.getDate() + 120);

  const [propertyCount, inspectionCount, reportCount, inspectionsThisWeek, reportsThisWeek, draftCount, completedInspectionCount, teamMemberCount, recentInspections, complianceCandidates, recentActivity, previousPeriodCount, propertiesForHealthScore] = companyId
    ? await Promise.all([
        prisma.property.count({ where: { companyId } }),
        prisma.inspection.count({ where: { property: { companyId }, deletedAt: null } }),
        prisma.report.count({ where: { inspection: { property: { companyId }, deletedAt: null } } }),
        prisma.inspection.count({ where: { property: { companyId }, deletedAt: null, completedDate: { gte: sevenDaysAgo } } }),
        prisma.report.count({ where: { inspection: { property: { companyId }, deletedAt: null }, generatedAt: { gte: sevenDaysAgo } } }),
        prisma.inspection.count({ where: { property: { companyId }, deletedAt: null, status: "draft" } }),
        prisma.inspection.count({ where: { property: { companyId }, deletedAt: null, status: "completed" } }),
        prisma.user.count({ where: { companyId } }),
        prisma.inspection.findMany({
          where: { property: { companyId }, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, type: true, status: true, createdAt: true, property: { select: { address: true } } },
        }),
        prisma.complianceDocument.findMany({
          where: { property: { companyId }, expiryDate: { lte: oneHundredTwentyDaysFromNow, not: null } },
          orderBy: { expiryDate: "asc" },
          take: 50, // a defensive cap, not a precise one - see the comment below on why this needs headroom
          select: { id: true, type: true, expiryDate: true, property: { select: { address: true } } },
        }),
        prisma.inspection.findMany({
          where: { property: { companyId }, deletedAt: null, createdAt: { gte: thirtyDaysAgo } },
          select: { createdAt: true },
        }),
        prisma.inspection.count({
          where: {
            property: { companyId },
            deletedAt: null,
            createdAt: { gte: (() => { const d = new Date(thirtyDaysAgo); d.setDate(d.getDate() - 30); return d; })(), lt: thirtyDaysAgo },
          },
        }),
        prisma.property.findMany({
          where: { companyId },
          select: {
            inspections: { take: 1, orderBy: { createdAt: "desc" }, select: { items: { select: { condition: true } } } },
            qrIssueReports: { where: { status: { not: "resolved" } }, select: { id: true } },
            complianceDocuments: { select: { expiryDate: true } },
          },
        }),
      ])
    : [0, 0, 0, 0, 0, 0, 0, 0, [], [], [], 0, []];

  // Groups the last 30 days into one bucket per day (oldest first), so the sparkline reads
  // left-to-right as a genuine timeline rather than an arbitrary order.
  const activityByDay: number[] = Array(30).fill(0);
  for (const { createdAt } of recentActivity) {
    const dayIndex = Math.floor((createdAt.getTime() - thirtyDaysAgo.getTime()) / (1000 * 60 * 60 * 24));
    if (dayIndex >= 0 && dayIndex < 30) activityByDay[dayIndex]++;
  }
  const inspectionsLast30Days = activityByDay.reduce((sum, n) => sum + n, 0);
  // Handles zero prior activity explicitly - a brand new company with nothing in the previous
  // period is a genuinely common real case, not an edge case to skip, and dividing by zero
  // would otherwise produce Infinity or NaN rather than a sensible percentage.
  const percentChange =
    previousPeriodCount > 0
      ? Math.round(((inspectionsLast30Days - previousPeriodCount) / previousPeriodCount) * 100)
      : inspectionsLast30Days > 0
        ? 100
        : 0;

  const poorHealthCount = propertiesForHealthScore.filter((p) => {
    const result = calculatePropertyHealthScore({
      itemConditions: p.inspections[0]?.items.map((i) => i.condition).filter((c): c is string => !!c) || [],
      complianceExpiryDates: p.complianceDocuments.map((d) => d.expiryDate),
      openIssueCount: p.qrIssueReports.length,
    });
    return result.band === "poor";
  }).length;

  // Filters with the exact same per-type threshold the compliance page itself uses (an EICR
  // expiring in 60 days genuinely counts as "expiring soon" against its own 90-day warning
  // window, even though a flat 30-day cutoff would have missed it entirely), then caps the
  // dashboard to the 5 most urgent so this stays a quick glance, not another full list to read.
  const expiringCompliance = complianceCandidates
    .filter((d) => getStatus(d.expiryDate, d.type).label !== "Valid")
    .slice(0, 5);

  const onboardingSteps = [
    { label: "Add your first property", done: propertyCount > 0, href: "/dashboard/properties/new" },
    { label: "Complete your first inspection", done: completedInspectionCount > 0, href: "/dashboard/inspections/new" },
    { label: "Invite your team", done: teamMemberCount > 1, href: "/dashboard/settings/team" },
  ];
  const onboardingComplete = onboardingSteps.every((s) => s.done);
  const onboardingDoneCount = onboardingSteps.filter((s) => s.done).length;

  const stats = [
    {
      label: "Properties",
      value: propertyCount,
      href: "/dashboard/properties",
      context: poorHealthCount > 0 ? `${poorHealthCount} need attention` : null,
      contextWarning: poorHealthCount > 0,
      iconBg: "bg-signal/10 text-signal",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 21v-4h6v4" />
        </svg>
      ),
    },
    {
      label: "Reports sent",
      value: reportCount,
      href: "/dashboard/inspections",
      context: reportsThisWeek > 0 ? `${reportsThisWeek} sent this week` : null,
      iconBg: "bg-signal/10 text-signal",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 4h16v16H4z" opacity="0" />
          <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      ),
    },
    {
      label: "In progress",
      value: draftCount,
      href: "/dashboard/inspections?status=draft",
      context: draftCount > 0 ? "Pick up where you left off" : "All caught up",
      iconBg: draftCount > 0 ? "bg-orange-100 text-orange-700" : "bg-verified/10 text-verified",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 3" />
        </svg>
      ),
    },
  ];

  return (
    <main>
      <DashboardInstallBanner />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">
            {getGreeting()}{displayName ? `, ${displayName}` : ""}
          </h1>
          <p className="text-sm text-slate mt-1">A quick look at your portfolio.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/properties/new" className="border border-line text-ink px-4 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors">
            + Add property
          </Link>
          <Link href="/dashboard/inspections/new" className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            + New inspection
          </Link>
        </div>
      </div>

      {expiringCompliance.length > 0 && (
        <section className="mt-6 bg-signal/5 border border-signal/30 border-l-4 border-l-signal rounded-xl p-6">
          <h2 className="font-display font-600 text-ink">Compliance needs attention</h2>
          <div className="mt-3 space-y-2">
            {expiringCompliance.map((doc) => {
              const status = getStatus(doc.expiryDate, doc.type);
              return (
                <Link
                  key={doc.id}
                  href="/dashboard/compliance?status=expiring-soon"
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-white/60 transition-colors"
                >
                  <div>
                    <p className="text-sm text-ink">{TYPE_LABELS[doc.type] || doc.type}</p>
                    <p className="text-xs text-slate mt-0.5">{doc.property.address}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${status.className}`}>{status.label}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!onboardingComplete && (
        <section className="mt-6 bg-white border border-line rounded-xl p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-display font-600 text-ink">Getting started</h2>
            <span className="text-xs text-slate">{onboardingDoneCount} of {onboardingSteps.length} done</span>
          </div>
          <div className="mt-3 space-y-2">
            {onboardingSteps.map((step) => (
              <Link
                key={step.label}
                href={step.href}
                className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${step.done ? "" : "hover:bg-paper"}`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${step.done ? "bg-verified text-white" : "border-2 border-line"}`}>
                  {step.done && (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </div>
                <span className={`text-sm ${step.done ? "text-slate line-through" : "text-ink"}`}>{step.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <Link href="/dashboard/inspections" className="mt-8 block bg-ink text-white rounded-2xl p-6 sm:p-8 hover:opacity-95 transition-opacity">
        <p className="text-sm text-white/60">Total inspections</p>
        <p className="font-display font-700 text-4xl sm:text-5xl mt-1">{inspectionCount}</p>
        <p className="text-sm text-white/60 mt-2">
          {inspectionsLast30Days} in the last 30 days
          {inspectionsLast30Days > 0 || previousPeriodCount > 0 ? (
            <span className={percentChange >= 0 ? "text-green-400" : "text-orange-300"}>
              {" "}
              · {percentChange >= 0 ? "↑" : "↓"} {Math.abs(percentChange)}% vs previous 30 days
            </span>
          ) : null}
        </p>
        <div className="mt-6 text-white/70">
          <Sparkline values={activityByDay} />
        </div>
      </Link>

      <section className="grid sm:grid-cols-3 gap-4 mt-4">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white border border-line rounded-xl p-5 hover:border-ink transition-colors block"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${stat.iconBg}`}>{stat.icon}</div>
            <p className="text-sm text-slate mt-3">{stat.label}</p>
            <p className="font-display font-700 text-2xl text-ink mt-1">{stat.value}</p>
            {stat.context && <p className={`text-xs mt-1 ${stat.contextWarning ? "text-signal font-medium" : "text-slate"}`}>{stat.context}</p>}
          </Link>
        ))}
      </section>

      {recentInspections.length > 0 && (
        <section className="mt-8 bg-white border border-line rounded-xl p-6">
          <h2 className="font-display font-600 text-ink">Recent inspections</h2>
          <div className="mt-3 space-y-2">
            {recentInspections.map((inspection) => (
              <Link
                key={inspection.id}
                href={`/dashboard/inspections/${inspection.id}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-paper transition-colors"
              >
                <div>
                  <p className="text-sm text-ink">{inspection.property.address}</p>
                  <p className="text-xs text-slate mt-0.5">
                    {inspectionTypeDisplayName(inspection.type)} · {formatDate(inspection.createdAt)}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                    inspection.status === "completed" ? "bg-verified/10 text-verified" : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {inspection.status === "completed" ? "Completed" : "Draft"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
