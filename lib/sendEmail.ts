// One small place that sends a plain-text email through Resend. Returns true only if it really went out.
export async function sendPlainEmail(to: string[], subject: string, lines: string[]): Promise<boolean> {
  const recipients = to.filter((e) => typeof e === "string" && e.includes("@"));
  if (!process.env.RESEND_API_KEY || recipients.length === 0) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>", to: recipients, subject, text: lines.join("\n") }),
    });
    if (!res.ok) { console.error("Resend error:", await res.text()); return false; }
    return true;
  } catch (err) { console.error("Resend request failed:", err); return false; }
}
