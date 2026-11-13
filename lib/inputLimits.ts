// Limits and cleaning for text that comes from people (the public contact form, the confirm-receipt page, the send-report box, a profile name). Pure (no server, no database), so every rule is tested
// directly. Nothing here throws: a bad value is cleaned or refused with a plain message.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_NAME = 100;
export const MAX_EMAIL = 254;
export const MAX_CONTACT_MESSAGE = 5000;
export const MAX_SUBJECT = 200;
export const MAX_EMAIL_MESSAGE = 5000;
export const MAX_REPORT_RECIPIENTS = 10;
export const MAX_SIGNATURE_CHARS = 300_000; // a drawn signature as a PNG is a few thousand characters; this is generous but not unlimited

// One line of text: no line breaks (they could be used to forge extra email headers or lines), spaces tidied, cut to length
export function oneLine(v: unknown, max: number): string {
  return (typeof v === "string" ? v : "").replace(/[\r\n\u2028\u2029\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, Math.max(0, max));
}
export const cleanPersonName = (v: unknown): string => oneLine(v, MAX_NAME);
export const cleanEmailSubject = (v: unknown): string => oneLine(v, MAX_SUBJECT);
// A longer message: line breaks are kept, other control characters are not, cut to length
export function cleanMessage(v: unknown, max: number): string {
  return (typeof v === "string" ? v : "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, Math.max(0, max));
}

export type ContactInput = { ok: true; name: string; email: string; message: string } | { ok: false; error: string };
export function cleanContactInput(name: unknown, email: unknown, message: unknown): ContactInput {
  const n = cleanPersonName(name), e = oneLine(email, MAX_EMAIL), m = cleanMessage(message, MAX_CONTACT_MESSAGE);
  if (!n || !e || !m) return { ok: false, error: "Please fill in your name, email, and message." };
  if (!EMAIL_PATTERN.test(e)) return { ok: false, error: "That email address doesn't look right - please check it." };
  if (typeof message === "string" && message.trim().length > MAX_CONTACT_MESSAGE) return { ok: false, error: `That message is too long - please keep it under ${MAX_CONTACT_MESSAGE} characters.` };
  return { ok: true, name: n, email: e, message: m };
}

// The recipients of a report email: a list of valid, different addresses, no more than MAX_REPORT_RECIPIENTS
export type RecipientList = { ok: true; emails: string[] } | { ok: false; error: string };
export function cleanRecipientList(v: unknown): RecipientList {
  if (!Array.isArray(v) || v.length === 0) return { ok: false, error: "Missing inspection or recipient email" };
  const seen = new Set<string>(), emails: string[] = [], bad: string[] = [];
  for (const item of v) {
    const e = typeof item === "string" ? item.trim() : "";
    if (!e || e.length > MAX_EMAIL || !EMAIL_PATTERN.test(e)) { bad.push(typeof item === "string" ? item.slice(0, 80) : String(item)); continue; }
    if (!seen.has(e.toLowerCase())) { seen.add(e.toLowerCase()); emails.push(e); }
  }
  if (bad.length > 0) return { ok: false, error: `Not a valid email address: ${bad.join(", ")}` };
  if (emails.length > MAX_REPORT_RECIPIENTS) return { ok: false, error: `A report can be sent to up to ${MAX_REPORT_RECIPIENTS} people at a time` };
  return { ok: true, emails };
}

// A drawn signature must be a real PNG picture sent as text, and not enormous. (Anything else is refused; it is shown on a page and printed in a report.)
export function isValidSignatureDataUrl(v: unknown): v is string {
  return typeof v === "string" && v.length <= MAX_SIGNATURE_CHARS && /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(v);
}
