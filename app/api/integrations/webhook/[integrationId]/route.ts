import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProvider } from "@/lib/integrations/registry";
import { processIntegrationEvent } from "@/lib/integrations/processEvent";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isIpBlocked, logSecurityEvent } from "@/lib/security";

export async function POST(req: Request, { params }: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await params;
  const clientIp = getClientIp(req);

  if (await isIpBlocked(clientIp)) {
    return NextResponse.json({ error: "Unable to process this request" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(`webhook:${integrationId}`, 100, 15);
  if (!rateLimit.allowed) {
    await logSecurityEvent("rate_limit_exceeded", "low", clientIp, "integrations/webhook", `Exceeded 100 requests in 15 minutes for integration ${integrationId}`);
    return NextResponse.json({ error: "Rate limit exceeded for this integration" }, { status: 429 });
  }

  const integration = await prisma.integration.findUnique({ where: { id: integrationId } });
  if (!integration) {
    // Deliberately a plain 404 with no further detail - this ID is an unguessable cuid, so
    // there's nothing more specific to say to whoever's calling an ID that doesn't exist.
    return NextResponse.json({ error: "Integration not found" }, { status: 404 });
  }

  const provider = getProvider(integration.provider);
  if (!provider) {
    // Shouldn't be reachable in practice - the settings UI only ever lets someone connect a
    // provider that's actually in FUNCTIONAL_PROVIDERS - but checked rather than assumed,
    // since a provider could in principle be removed from the registry after integrations
    // using it already exist.
    return NextResponse.json({ error: "This integration's provider is not currently available" }, { status: 500 });
  }

  // Read as raw text, not parsed JSON - signature verification needs the exact bytes that
  // were sent, and re-serializing a parsed object could produce different bytes (key order,
  // whitespace) than what was actually signed.
  const rawBody = await req.text();

  if (!provider.verifyWebhookSignature(rawBody, req.headers, integration.webhookSecret)) {
    // Rejected before any parsing happens at all - an unverified request never reaches the
    // property-matching or scheduling logic no matter what its payload claims.
    await logSecurityEvent("invalid_webhook_signature", "low", clientIp, "integrations/webhook", `Invalid signature for integration ${integrationId}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = provider.parseWebhookEvent(rawBody, req.headers);

  if (!event) {
    await prisma.integrationEvent.create({
      data: {
        integrationId: integration.id,
        eventType: "unknown",
        rawPayload: rawBody,
        status: "ignored",
        resultMessage: "Payload didn't match this provider's expected event shape",
      },
    });
    // Still a 200 - the signature was genuinely valid, so this is a legitimate delivery from
    // the provider that just isn't one this framework can act on, not an error on the
    // sender's part that should make them think the delivery itself failed.
    return NextResponse.json({ status: "ignored" });
  }

  // Checked BEFORE any processing happens - webhook delivery is commonly retried by the
  // sending platform, and doing this check after processing would mean a retried delivery
  // could create a second, duplicate inspection before the duplicate was ever detected.
  if (event.externalId) {
    const existing = await prisma.integrationEvent.findUnique({
      where: { integrationId_externalEventId: { integrationId: integration.id, externalEventId: event.externalId } },
    });
    if (existing) {
      return NextResponse.json({ status: "already processed", eventId: existing.id });
    }
  }

  let result;
  try {
    result = await processIntegrationEvent(integration, event);
  } catch (err: any) {
    result = { status: "failed" as const, message: err?.message || "Unexpected error while processing this event" };
  }

  await prisma.integrationEvent.create({
    data: {
      integrationId: integration.id,
      externalEventId: event.externalId || undefined,
      eventType: event.type,
      rawPayload: rawBody,
      status: result.status,
      resultMessage: result.message,
      createdInspectionId: "createdInspectionId" in result ? result.createdInspectionId : undefined,
    },
  });

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      lastEventAt: new Date(),
      status: result.status === "failed" ? "error" : "connected",
      lastErrorMessage: result.status === "failed" ? result.message : null,
    },
  });

  return NextResponse.json({ status: result.status, message: result.message });
}
