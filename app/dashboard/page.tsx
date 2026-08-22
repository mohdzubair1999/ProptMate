import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import DashboardInstallBanner from "./dashboard-install-banner";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
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

  const [propertyCount, inspectionCount, reportCount, inspectionsThisWeek, reportsThisWeek, draftCount, completedInspectionCount, teamMemberCount] = companyId
    ? await Promise.all([
        prisma.property.count({ where: { companyId } }),
        prisma.inspection.count({ where: { property: { companyId } } }),
        prisma.report.count({ where: { inspection: { property: { companyId } } } }),
        prisma.inspection.count({ where: { property: { companyId }, completedDate: { gte: sevenDaysAgo } } }),
        prisma.report.count({ where: { inspection: { property: { companyId } }, generatedAt: { gte: sevenDaysAgo } } }),
        prisma.inspection.count({ where: { property: { companyId }, status: "draft" } }),
        prisma.inspection.count({ where: { property: { companyId }, status: "completed" } }),
        prisma.user.count({ where: { companyId } }),
      ])
    : [0, 0, 0, 0, 0, 0, 0, 0];

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
      context: null,
      iconBg: "bg-signal/10 text-signal",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 21v-4h6v4" />
        </svg>
      ),
    },
    {
      label: "Inspections",
      value: inspectionCount,
      href: "/dashboard/inspections",
      context: inspectionsThisWeek > 0 ? `${inspectionsThisWeek} completed this week` : null,
      iconBg: "bg-verified/10 text-verified",
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="4" width="14" height="17" rx="1" />
          <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z" />
          <path d="M9 12l2 2 4-4" />
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

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {stats.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-white border border-line rounded-xl p-6 hover:border-ink transition-colors block"
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${stat.iconBg}`}>{stat.icon}</div>
            <p className="text-sm text-slate mt-4">{stat.label}</p>
            <p className="font-display font-700 text-3xl text-ink mt-1">{stat.value}</p>
            {stat.context && <p className="text-xs text-slate mt-1.5">{stat.context}</p>}
          </Link>
        ))}
      </section>
    </main>
  );
}
