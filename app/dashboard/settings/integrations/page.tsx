import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { FUNCTIONAL_PROVIDERS, COMING_SOON_PROVIDERS } from "@/lib/integrations/registry";
import ConnectIntegrationForm from "./connect-integration-form";
import IntegrationCard from "./integration-card";

export default async function IntegrationsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  const role = (session.user as any).role as string | undefined;
  const canManage = role === "ADMIN" || role === "MANAGER";

  const [integrations, templates, staffUsers] = companyId
    ? await Promise.all([
        prisma.integration.findMany({
          where: { companyId },
          orderBy: { createdAt: "desc" },
          include: { events: { orderBy: { createdAt: "desc" }, take: 5 } },
        }),
        prisma.template.findMany({ where: { companyId }, select: { id: true, name: true, inspectionType: true } }),
        prisma.user.findMany({ where: { companyId, role: { in: ["ADMIN", "MANAGER", "INSPECTOR"] } }, select: { id: true, name: true, email: true } }),
      ])
    : [[], [], []];

  const connectedProviderKeys = new Set(integrations.map((i) => i.provider));

  return (
    <main>
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>

      <div className="mt-4">
        <h1 className="font-display font-700 text-2xl text-ink">Integrations</h1>
        <p className="text-sm text-slate mt-1">
          Connect a CRM or property-management platform so a new tenancy can automatically schedule its check-in, instead of someone having to remember to set it up manually.
        </p>
      </div>

      {integrations.length > 0 && (
        <div className="mt-8 space-y-4">
          {integrations.map((integration) => {
            const providerDisplayName =
              FUNCTIONAL_PROVIDERS.find((p) => p.key === integration.provider)?.displayName ||
              COMING_SOON_PROVIDERS.find((p) => p.key === integration.provider)?.displayName ||
              integration.provider;
            return (
              <IntegrationCard
                key={integration.id}
                integration={{
                  id: integration.id,
                  provider: integration.provider,
                  displayName: integration.displayName,
                  status: integration.status,
                  lastErrorMessage: integration.lastErrorMessage,
                  lastEventAt: integration.lastEventAt,
                  webhookSecret: integration.webhookSecret,
                  autoScheduleCheckIn: integration.autoScheduleCheckIn,
                  defaultTemplateId: integration.defaultTemplateId,
                  defaultInspectorId: integration.defaultInspectorId,
                  scheduleDaysBeforeStart: integration.scheduleDaysBeforeStart,
                  events: integration.events.map((e) => ({
                    id: e.id,
                    eventType: e.eventType,
                    status: e.status,
                    resultMessage: e.resultMessage,
                    createdAt: e.createdAt.toISOString(),
                  })),
                }}
                providerDisplayName={providerDisplayName}
                webhookUrl={`${process.env.NEXT_PUBLIC_APP_URL || "https://proptmate.zkmholdingslimited.com"}/api/integrations/webhook/${integration.id}`}
                templates={templates}
                staffUsers={staffUsers}
                canManage={canManage}
              />
            );
          })}
        </div>
      )}

      {canManage && (
        <div className="mt-8">
          <h2 className="font-display font-600 text-lg text-ink mb-3">Connect a new integration</h2>
          <ConnectIntegrationForm providers={FUNCTIONAL_PROVIDERS.map((p) => ({ key: p.key, displayName: p.displayName, description: p.description, credentialFields: p.credentialFields }))} />
        </div>
      )}

      <div className="mt-10">
        <h2 className="font-display font-600 text-sm text-slate uppercase tracking-wide">Coming soon</h2>
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          {COMING_SOON_PROVIDERS.map((p) => (
            <div key={p.key} className="bg-line/30 border border-line rounded-xl p-5 opacity-70">
              <h3 className="font-display font-600 text-ink">{p.displayName}</h3>
              <p className="text-sm text-slate mt-1">{p.description}</p>
              <p className="text-xs text-slate mt-2 italic">Not yet connectable - requires real API access to build against.</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
