"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { getProvider } from "@/lib/integrations/registry";

async function requireManagerOrAdmin() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const companyId = (session.user as any).companyId as string | null;
  const role = (session.user as any).role as string;
  if (!companyId) throw new Error("No company associated with this account");
  if (role !== "ADMIN" && role !== "MANAGER") throw new Error("Only an Admin or Manager can connect or configure integrations");
  return companyId;
}

export async function createIntegration(providerKey: string, displayName: string, credentials: Record<string, string>) {
  const companyId = await requireManagerOrAdmin();

  const provider = getProvider(providerKey);
  if (!provider) throw new Error("Unknown or not-yet-available provider");

  for (const field of provider.credentialFields) {
    if (!credentials[field.key]?.trim()) throw new Error(`${field.label} is required`);
  }

  let status = "connected";
  let lastErrorMessage: string | null = null;

  // Only actually attempted when the provider offers a real check and credentials were
  // genuinely entered - a webhook-only provider like Generic Webhook has neither, and is
  // simply considered connected from the moment it's created, since there's nothing to
  // validate about an integration that holds no credentials of its own.
  if (provider.testConnection && provider.credentialFields.length > 0) {
    const testResult = await provider.testConnection(credentials);
    if (!testResult.ok) {
      status = "error";
      lastErrorMessage = testResult.message || "Connection test failed";
    }
  }

  const integration = await prisma.integration.create({
    data: {
      companyId,
      provider: providerKey,
      displayName: displayName.trim() || provider.displayName,
      status,
      lastErrorMessage,
      encryptedCredentials: Object.keys(credentials).length > 0 ? encrypt(JSON.stringify(credentials)) : null,
    },
  });

  revalidatePath("/dashboard/settings/integrations");
  return { id: integration.id, status };
}

export async function updateIntegrationSettings(
  integrationId: string,
  settings: {
    displayName?: string;
    autoScheduleCheckIn?: boolean;
    defaultTemplateId?: string | null;
    defaultInspectorId?: string | null;
    scheduleDaysBeforeStart?: number;
  }
) {
  const companyId = await requireManagerOrAdmin();

  const existing = await prisma.integration.findFirst({ where: { id: integrationId, companyId } });
  if (!existing) throw new Error("Integration not found");

  // Turning auto-scheduling on without a default inspector would create integrations that
  // silently fail every single event forever (Inspection.inspectorId is required at the
  // database level - see processEvent.ts) - checked here so that misconfiguration is caught
  // the moment it's saved, not discovered days later when the first real event comes in and
  // nothing happens.
  const willAutoSchedule = settings.autoScheduleCheckIn ?? existing.autoScheduleCheckIn;
  const willHaveInspector = settings.defaultInspectorId !== undefined ? settings.defaultInspectorId : existing.defaultInspectorId;
  if (willAutoSchedule && !willHaveInspector) {
    throw new Error("A default inspector must be set before auto-scheduling can be turned on");
  }

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      displayName: settings.displayName?.trim() || undefined,
      autoScheduleCheckIn: settings.autoScheduleCheckIn,
      defaultTemplateId: settings.defaultTemplateId,
      defaultInspectorId: settings.defaultInspectorId,
      scheduleDaysBeforeStart: settings.scheduleDaysBeforeStart,
    },
  });

  revalidatePath("/dashboard/settings/integrations");
}

export async function testExistingIntegration(integrationId: string) {
  const companyId = await requireManagerOrAdmin();

  const integration = await prisma.integration.findFirst({ where: { id: integrationId, companyId } });
  if (!integration) throw new Error("Integration not found");

  const provider = getProvider(integration.provider);
  if (!provider) throw new Error("This integration's provider is not currently available");

  if (!provider.testConnection) {
    return { ok: true, message: "This provider doesn't support a connection test - it's ready to receive webhook events." };
  }

  const credentials = integration.encryptedCredentials ? JSON.parse(decrypt(integration.encryptedCredentials)) : {};
  const result = await provider.testConnection(credentials);

  await prisma.integration.update({
    where: { id: integrationId },
    data: {
      status: result.ok ? "connected" : "error",
      lastErrorMessage: result.ok ? null : result.message || "Connection test failed",
    },
  });

  revalidatePath("/dashboard/settings/integrations");
  return result;
}

export async function deleteIntegration(integrationId: string) {
  const companyId = await requireManagerOrAdmin();

  const existing = await prisma.integration.findFirst({ where: { id: integrationId, companyId } });
  if (!existing) throw new Error("Integration not found");

  // IntegrationEvent.integrationId is set to null automatically when this row is deleted
  // (onDelete: SetNull in the schema) - the event history for what this integration did
  // stays intact and still readable, just no longer attributed to a still-existing
  // integration record.
  await prisma.integration.delete({ where: { id: integrationId } });

  revalidatePath("/dashboard/settings/integrations");
}
