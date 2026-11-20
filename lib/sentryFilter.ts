// "Failed to find Server Action" happens when someone's browser tab, opened before a deploy, clicks a button after it: the old page asks for an action
// the new version no longer has. It is not a bug in the app and a refresh fixes it, so it is not worth an alert. Pure, so it is tested without Sentry.
const STALE_ACTION = /failed to find server action/i;

export function isStaleServerActionError(event: unknown, hint?: unknown): boolean {
  try {
    const e = event as { message?: unknown; exception?: { values?: { value?: unknown }[] } } | null;
    if (typeof e?.message === "string" && STALE_ACTION.test(e.message)) return true;
    if (e?.exception?.values?.some((v) => typeof v?.value === "string" && STALE_ACTION.test(v.value))) return true;
    const original = (hint as { originalException?: unknown } | null | undefined)?.originalException;
    if (original instanceof Error && STALE_ACTION.test(original.message)) return true;
    if (typeof original === "string" && STALE_ACTION.test(original)) return true;
  } catch { /* never let the filter itself break error reporting */ }
  return false;
}
