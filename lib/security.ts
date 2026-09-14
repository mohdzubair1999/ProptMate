import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

export type SecurityEventType =
  | "rate_limit_exceeded"
  | "invalid_webhook_signature"
  | "invalid_file_upload"
  | "invalid_photo_url"
  | "cross_company_access_attempt";

// How many events from the same IP, within this window, escalate a run of individually-low
// events into a genuine, immediate alert - calibrated so a real tenant fumbling a form
// (mistyping, retrying an upload once or twice) never reaches it, but a sustained, automated
// attempt against one endpoint does.
const ESCALATION_THRESHOLD = 5;
const ESCALATION_WINDOW_MINUTES = 15;

// Once an alert has fired for a given IP, no second alert for that same IP within this
// cooldown - without this, a sustained attack of (say) 20 requests would send 16 separate
// emails (one for every event past the threshold), which floods the inbox at exactly the
// moment a single, clear alert matters most. Reuses the existing rate limiter as a plain
// "has this fired recently" check - a limit of 1 per window is exactly a cooldown.
const ALERT_COOLDOWN_MINUTES = 30;

async function sendSecurityAlertEmail(subject: string, bodyLines: string[]) {
  const alertEmail = process.env.SECURITY_ALERT_EMAIL;
  if (!process.env.RESEND_API_KEY || !alertEmail) return;
  const fromAddress = process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddress, to: [alertEmail], subject, text: bodyLines.join("\n") }),
  });
  if (!res.ok) {
    console.error("Resend error (security alert):", await res.text());
  }
}

async function sendAlertOncePerCooldown(ipAddress: string, subject: string, bodyLines: string[]) {
  const cooldown = await checkRateLimit(`security-alert-cooldown:${ipAddress}`, 1, ALERT_COOLDOWN_MINUTES);
  if (!cooldown.allowed) return; // an alert for this IP already went out recently - the admin already knows
  await sendSecurityAlertEmail(subject, bodyLines);
}

// Logs a security event, and - if this pushes the same IP over the escalation threshold
// within the recent window - sends an immediate email alert (at most once per cooldown
// window per IP, however many events it triggers in that time). A single, one-off
// low-severity event never alerts on its own; a genuine pattern from one source does. An
// event already marked "high" severity by the caller (e.g. cross-company access, which
// should never happen even once) always attempts an alert immediately regardless of any
// pattern, subject to the same per-IP cooldown so a repeat of the same high-severity issue
// doesn't spam either.
//
// Deliberately never throws - a failure logging or alerting on a security event must never
// crash the actual request being handled (e.g. the rate-limit rejection the visitor should
// see); a logging failure is itself just logged to the console and swallowed here.
export async function logSecurityEvent(type: SecurityEventType, severity: "low" | "high", ipAddress: string, endpoint: string, details: string) {
  try {
    await prisma.securityEvent.create({ data: { type, severity, ipAddress, endpoint, details } });

    if (severity === "high") {
      await sendAlertOncePerCooldown(
        ipAddress,
        `ProptMate security alert: ${type.replace(/_/g, " ")}`,
        [`IP address: ${ipAddress}`, `Endpoint: ${endpoint}`, `Details: ${details}`, "", "Review and block this IP from Settings → Security if needed."]
      );
      return;
    }

    const windowStart = new Date(Date.now() - ESCALATION_WINDOW_MINUTES * 60 * 1000);
    const recentCount = await prisma.securityEvent.count({ where: { ipAddress, createdAt: { gte: windowStart } } });

    if (recentCount >= ESCALATION_THRESHOLD) {
      await sendAlertOncePerCooldown(
        ipAddress,
        "ProptMate security alert: repeated suspicious activity from one source",
        [
          `IP address ${ipAddress} has triggered ${recentCount} security events in the last ${ESCALATION_WINDOW_MINUTES} minutes.`,
          `Most recent: ${type.replace(/_/g, " ")} on ${endpoint} - ${details}`,
          "",
          "Review and block this IP from Settings → Security if needed.",
        ]
      );
    }
  } catch (err) {
    console.error("Failed to log security event:", err);
  }
}

export async function isIpBlocked(ipAddress: string): Promise<boolean> {
  if (ipAddress === "unknown") return false; // never block based on a genuinely unresolvable IP - that would risk blocking everyone behind it
  const blocked = await prisma.blockedIp.findUnique({ where: { ipAddress } });
  return !!blocked;
}
