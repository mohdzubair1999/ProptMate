import * as Sentry from "@sentry/nextjs";
import { isStaleServerActionError } from "@/lib/sentryFilter";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Attaches local variable values to server-side stack frames — genuinely useful for
  // actually diagnosing what went wrong, not just where.
  includeLocalVariables: true,

  // a tab left open across a deploy is not a bug: drop that one error instead of alerting on it
  beforeSend(event, hint) {
    return isStaleServerActionError(event, hint) ? null : event;
  },
});
