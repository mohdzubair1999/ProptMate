"use server";

import { headers } from "next/headers";
import { checkRateLimit } from "@/lib/rateLimit";
import { cleanContactInput } from "@/lib/inputLimits";

// Sends contact form submissions to the company's own inbox via Resend — same email
// provider already wired up for report delivery elsewhere in the app.
export async function sendContactMessage(formData: FormData) {
  // A public form: limited per visitor so it cannot be used to flood the inbox, and every field is cleaned and capped.
  const forwardedFor = (await headers()).get("x-forwarded-for");
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim().slice(0, 64) : "unknown";
  const limit = await checkRateLimit(`contact-form:${clientIp}`, 5, 15);
  if (!limit.allowed) return { error: "Too many messages sent recently - please try again in a few minutes." };

  const input = cleanContactInput(formData.get("name"), formData.get("email"), formData.get("message"));
  if (!input.ok) return { error: input.error };
  const { name, email, message } = input;

  if (!process.env.RESEND_API_KEY) {
    return { error: "Contact form isn't configured yet — set RESEND_API_KEY and CONTACT_EMAIL in your environment." };
  }

  const destination = process.env.CONTACT_EMAIL;
  if (!destination) {
    return { error: "Contact form isn't configured yet — set CONTACT_EMAIL in your environment." };
  }

  const fromAddress = process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: destination,
        reply_to: email,
        subject: `Contact form: ${name}`,
        text: `From: ${name} <${email}>\n\n${message}`,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Resend error (contact form):", errText);
      return { error: "Couldn't send your message right now — please try again in a moment." };
    }

    return { success: true };
  } catch (err) {
    console.error("Contact form error:", err);
    return { error: "Couldn't send your message right now — please try again in a moment." };
  }
}
