// The one contract every CRM/property-management integration implements. Everything else in
// this framework (the webhook receiver, the auto-scheduling logic, the settings UI) is
// written against this interface only - it never needs to know whether it's talking to
// Arthur, Goodlord, or anything else. Adding a new platform means writing a new file that
// implements this interface and registering it in registry.ts, not touching any of that
// shared code.

// What every provider normalises its own, differently-shaped webhook payload into. The rest
// of the framework only ever works with this shape, regardless of which platform sent it -
// this is the actual point of having a provider abstraction at all: Arthur's JSON and
// Goodlord's JSON (whatever shape each turns out to be, once there's real API access to
// build against) both become the same few fields here.
export type NormalizedIntegrationEvent = {
  // What kind of thing happened. "tenancy.created" is the one this framework currently acts
  // on (auto-scheduling a check-in); other types can be received and logged without
  // necessarily being acted on yet, so a provider isn't blocked from being connected just
  // because this framework doesn't yet have a specific response to every event type it sends.
  type: "tenancy.created" | "tenancy.ending" | "tenancy.ended" | "unknown";

  // The provider's own id for whatever this event is about (a tenancy, a property) - used
  // for idempotency (see IntegrationEvent.externalEventId) and, later, for correlating
  // ProptMate's own records back to the source system if that's ever needed.
  externalId: string | null;

  propertyAddress: string;
  propertyCity?: string;
  propertyPostcode?: string;

  tenantName?: string;
  tenantEmail?: string;

  tenancyStartDate?: Date;
  tenancyEndDate?: Date;

  // The exact, original payload - kept alongside the normalized fields above so a provider
  // that turns out to send extra useful data this framework doesn't parse yet isn't lost;
  // it's just sitting in IntegrationEvent.rawPayload for whoever's debugging it later.
  raw: unknown;
};

export type IntegrationCredentials = Record<string, string>;

// What a person actually needs to type in to connect this provider - drives the connect
// form in the settings UI generically, rather than that UI needing its own special case for
// every provider (an API key field looks the same regardless of whose API the key is for).
export type CredentialField = {
  key: string;
  label: string;
  placeholder?: string;
  secret: boolean; // masked in the UI (an API key) vs shown in plain (an account/tenant ID)
};

export interface IntegrationProvider {
  key: string; // matches Integration.provider in the database
  displayName: string;
  description: string;

  // Empty array means "webhook-only, no credentials to enter" - a provider that only ever
  // pushes events in doesn't necessarily need ProptMate to hold any credentials of its own.
  credentialFields: CredentialField[];

  // Verifies an incoming webhook request genuinely came from this provider (or from
  // wherever the provider's own webhook settings were configured with this integration's
  // secret) before any payload parsing happens at all. Returning false here means the
  // request is rejected outright - this check runs first, deliberately, so a forged request
  // can never reach the parsing/scheduling logic no matter what it contains.
  verifyWebhookSignature(rawBody: string, headers: Headers, webhookSecret: string): boolean;

  // Turns the provider's own webhook payload into the common shape above. Returns null when
  // the payload doesn't represent an event this framework recognises at all (rather than
  // throwing), so an unrecognised-but-legitimate event from the provider is logged and
  // skipped rather than treated as an error.
  parseWebhookEvent(rawBody: string, headers: Headers): NormalizedIntegrationEvent | null;

  // Optional - a lightweight call to confirm entered credentials are actually valid, used by
  // the "Test connection" button in the settings UI so a typo'd API key is caught immediately
  // rather than only discovered days later when the first real webhook silently fails.
  testConnection?(credentials: IntegrationCredentials): Promise<{ ok: boolean; message?: string }>;
}
