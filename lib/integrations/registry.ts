import type { IntegrationProvider } from "./types";
import { genericWebhookProvider } from "./providers/generic-webhook";

// Providers that can genuinely be connected and used today - implement the full
// IntegrationProvider interface and are verified end-to-end.
export const FUNCTIONAL_PROVIDERS: IntegrationProvider[] = [genericWebhookProvider];

export function getProvider(key: string): IntegrationProvider | undefined {
  return FUNCTIONAL_PROVIDERS.find((p) => p.key === key);
}

// Named CRMs this framework is designed to support once real API access exists for them -
// shown in the settings UI as "coming soon" so the intended direction is visible, but never
// offered as connectable, since a connect button that doesn't actually do anything real
// would be more confusing than simply not listing it yet. Move an entry from here to
// FUNCTIONAL_PROVIDERS above once its real API docs and credentials are available and a
// genuine provider implementation (signature verification, event parsing, tested against
// the real API) has been built and verified for it - not before.
export const COMING_SOON_PROVIDERS: { key: string; displayName: string; description: string }[] = [
  {
    key: "arthur",
    displayName: "Arthur",
    description: "UK property management platform. Requires an Arthur account and API access - see arthuronline.co.uk.",
  },
  {
    key: "goodlord",
    displayName: "Goodlord",
    description: "UK lettings platform. Requires a Goodlord partnership agreement and sandbox access arranged directly with their team.",
  },
];
