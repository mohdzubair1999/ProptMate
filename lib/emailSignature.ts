// The sign-off on every outgoing email (the report, confirmation requests, tenant portal invitations). It names whoever is actually SENDING: the staff member and their company, from
// their own account. Anything missing falls back to the REPORT_SIGNATURE_* settings (then to the built-in defaults), so a company that has not filled its details in still gets a
// complete signature. Everything is checked and made safe for HTML: company and staff names are typed in by users, so none of it is trusted.
export type SignatureInfo = { name?: string | null; company?: string | null; email?: string | null; website?: string | null };
export type Signature = { name: string; company: string; email: string; website: string };

const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");
const validEmail = (v: string): boolean => /^[^\s@<>"'()\\,;:]+@[^\s@<>"'()\\,;:]+\.[^\s@<>"'()\\,;:]+$/.test(v) && v.length <= 120;
const cleanWebsite = (v: unknown): string => {
  const t = clean(v, 120).replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(\/[A-Za-z0-9._~\-\/%]*)?$/.test(t) && t.includes(".") ? t : ""; // a plain address such as example.com or example.com/about; anything else is dropped
};
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

// What goes in the signature: the sender's own details first, then the settings, then the built-in defaults
export function resolveSignature(info?: SignatureInfo | null): Signature {
  const env = (k: string) => (typeof process !== "undefined" ? process.env[k] : undefined);
  const email = [clean(info?.email, 120), clean(env("REPORT_SIGNATURE_EMAIL"), 120), "md@zkmholdingslimited.com"].find((e) => e && validEmail(e)) as string;
  return {
    name: clean(info?.name, 80) || clean(env("REPORT_SIGNATURE_NAME"), 80) || "Zubair Mohammed",
    company: clean(info?.company, 100) || clean(env("REPORT_SIGNATURE_COMPANY"), 100) || "ZKM Holdings Limited (ProptMate)",
    email,
    website: cleanWebsite(info?.website) || cleanWebsite(env("REPORT_SIGNATURE_WEBSITE")) || "zkmholdingslimited.com",
  };
}

export function getEmailSignatureHtml(info?: SignatureInfo | null): string {
  const s = resolveSignature(info);
  const e = { name: escapeHtml(s.name), company: escapeHtml(s.company), email: escapeHtml(s.email), website: escapeHtml(s.website) };
  return `
    <p style="color: #25344A; font-size: 14px; margin-top: 32px; line-height: 1.5;">
      Kind regards,<br />
      ${e.name}<br />
      ${e.company}<br />
      <a href="mailto:${e.email}" style="color: #D96B44;">${e.email}</a><br />
      <a href="https://${e.website}" style="color: #D96B44;">${e.website}</a>
    </p>
  `;
}

// Plain-text counterpart, with exactly the same values as the HTML version. Every outgoing email needs both a text and an HTML version: an HTML-only email is itself a spam signal.
export function getEmailSignatureText(info?: SignatureInfo | null): string {
  const s = resolveSignature(info);
  return `Kind regards,\n${s.name}\n${s.company}\n${s.email}\n${s.website}`;
}
