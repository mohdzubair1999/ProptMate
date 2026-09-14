import { createHmac, timingSafeEqual } from "crypto";
import type { IntegrationProvider, NormalizedIntegrationEvent } from "../types";

// A deliberately simple, documented JSON shape and HMAC-SHA256 signing scheme - lets this
// entire framework (signature verification, event parsing, property matching, auto-
// scheduling) be genuinely tested right now with nothing more than curl, and remains usable
// afterwards as a real connector for any platform that can send a webhook (Zapier, Make,
// a custom script) but doesn't have a dedicated provider built for it yet.
//
// Expected payload shape:
// {
//   "type": "tenancy.created",
//   "externalId": "some-id-from-the-sending-system",
//   "propertyAddress": "12 Example Street",
//   "propertyCity": "London",
//   "propertyPostcode": "E17 1AA",
//   "tenantName": "Jane Doe",
//   "tenantEmail": "jane@example.com",
//   "tenancyStartDate": "2026-10-01"
// }
//
// Signed by computing HMAC-SHA256 of the exact raw request body using the integration's own
// webhook secret (shown in the settings UI once the integration is created), sent as the
// X-Webhook-Signature header, as a hex string.

function parseDateField(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? undefined : parsed;
}

export const genericWebhookProvider: IntegrationProvider = {
  key: "generic-webhook",
  displayName: "Generic Webhook",
  description:
    "A simple, documented webhook format for testing this framework, or for connecting a platform that can send a webhook (e.g. via Zapier or Make) but doesn't have a dedicated integration yet.",
  credentialFields: [], // nothing to enter - verification is by the webhook secret alone

  verifyWebhookSignature(rawBody, headers, webhookSecret) {
    const provided = headers.get("x-webhook-signature");
    if (!provided) return false;
    const expected = createHmac("sha256", webhookSecret).update(rawBody, "utf8").digest("hex");
    // Constant-time comparison - a naive `provided === expected` string comparison leaks
    // timing information about how many leading characters matched, which is exactly the
    // kind of side channel that lets an attacker guess a valid signature byte by byte.
    const providedBuf = Buffer.from(provided, "hex");
    const expectedBuf = Buffer.from(expected, "hex");
    if (providedBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(providedBuf, expectedBuf);
  },

  parseWebhookEvent(rawBody): NormalizedIntegrationEvent | null {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null; // not valid JSON at all - nothing to parse
    }

    const validTypes = ["tenancy.created", "tenancy.ending", "tenancy.ended"];
    const type = validTypes.includes(payload.type as string) ? (payload.type as NormalizedIntegrationEvent["type"]) : "unknown";

    if (typeof payload.propertyAddress !== "string" || !payload.propertyAddress.trim()) {
      // No address at all means there's genuinely nothing to match or create a property
      // from - returning null here (rather than a NormalizedIntegrationEvent with an empty
      // address) lets the webhook receiver log this as "ignored: no address", which is a
      // clearer signal than a downstream property-matching failure would be.
      return null;
    }

    return {
      type,
      externalId: typeof payload.externalId === "string" ? payload.externalId : null,
      propertyAddress: payload.propertyAddress.trim(),
      propertyCity: typeof payload.propertyCity === "string" ? payload.propertyCity.trim() : undefined,
      propertyPostcode: typeof payload.propertyPostcode === "string" ? payload.propertyPostcode.trim() : undefined,
      tenantName: typeof payload.tenantName === "string" ? payload.tenantName.trim() : undefined,
      tenantEmail: typeof payload.tenantEmail === "string" ? payload.tenantEmail.trim() : undefined,
      tenancyStartDate: parseDateField(payload.tenancyStartDate),
      tenancyEndDate: parseDateField(payload.tenancyEndDate),
      raw: payload,
    };
  },
};
