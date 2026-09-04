// Shared between every outgoing email in the app, so the signature always reads identically
// regardless of which feature sent the email, rather than risking separate copies drifting
// out of sync over time.
export function getEmailSignatureHtml(): string {
  const signatureName = process.env.REPORT_SIGNATURE_NAME || "Zubair Mohammed";
  const signatureCompany = process.env.REPORT_SIGNATURE_COMPANY || "ZKM Holdings Limited (ProptMate)";
  const signatureEmail = process.env.REPORT_SIGNATURE_EMAIL || "md@zkmholdingslimited.com";
  const signatureWebsite = (process.env.REPORT_SIGNATURE_WEBSITE || "zkmholdingslimited.com").replace(/^https?:\/\//, "");

  return `
    <p style="color: #25344A; font-size: 14px; margin-top: 32px; line-height: 1.5;">
      Kind regards,<br />
      ${signatureName}<br />
      ${signatureCompany}<br />
      <a href="mailto:${signatureEmail}" style="color: #D96B44;">${signatureEmail}</a><br />
      <a href="https://${signatureWebsite}" style="color: #D96B44;">${signatureWebsite}</a>
    </p>
  `;
}

// Plain-text counterpart, sharing the exact same env-var-driven values as the HTML version
// above so the two can never drift out of sync. Every outgoing email needs both a text and
// html version - an HTML-only email (no plain-text alternative at all) is itself a real,
// well-documented spam signal mail providers weigh, separate from domain authentication.
export function getEmailSignatureText(): string {
  const signatureName = process.env.REPORT_SIGNATURE_NAME || "Zubair Mohammed";
  const signatureCompany = process.env.REPORT_SIGNATURE_COMPANY || "ZKM Holdings Limited (ProptMate)";
  const signatureEmail = process.env.REPORT_SIGNATURE_EMAIL || "md@zkmholdingslimited.com";
  const signatureWebsite = (process.env.REPORT_SIGNATURE_WEBSITE || "zkmholdingslimited.com").replace(/^https?:\/\//, "");

  return `Kind regards,\n${signatureName}\n${signatureCompany}\n${signatureEmail}\n${signatureWebsite}`;
}
