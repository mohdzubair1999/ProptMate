import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // 100% in dev so nothing gets missed while testing; sampled down in production to keep
  // event volume within the free plan's monthly quota.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Session Replay and Logging deliberately left off for this first pass — the goal right
  // now is knowing when something breaks, not full observability. Straightforward to add
  // later if it turns out to be useful.
});

// Hooks into App Router navigation so route changes show up as their own tracing spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
