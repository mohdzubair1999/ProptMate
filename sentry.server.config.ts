import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Attaches local variable values to server-side stack frames — genuinely useful for
  // actually diagnosing what went wrong, not just where.
  includeLocalVariables: true,
});
