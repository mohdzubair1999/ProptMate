import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins/two-factor";
import { prismaAdapter } from "better-auth/adapters/prisma";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // No session.strategy setting needed — unlike NextAuth v4, Better Auth always uses
  // database-backed sessions by design, there's nothing to opt into.
  emailAndPassword: {
    enabled: true,
    // Preserve compatibility with the bcrypt hashes already stored from the old auth
    // system — without this, Better Auth defaults to scrypt and every existing user's
    // password would silently stop working.
    password: {
      hash: async (password: string) => bcrypt.hash(password, 10),
      verify: async ({ hash, password }: { hash: string; password: string }) => bcrypt.compare(password, hash),
    },
    // Better Auth generates the token and verification URL itself — this callback is only
    // responsible for actually sending the email, same Resend setup already used for
    // report delivery and the contact form.
    sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      if (!process.env.RESEND_API_KEY) {
        console.error("Cannot send password reset email — RESEND_API_KEY is not set.");
        return;
      }
      const fromAddress = process.env.EMAIL_FROM || "ProptMate <onboarding@resend.dev>";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: user.email,
          subject: "Reset your ProptMate password",
          text: `Someone requested a password reset for your ProptMate account.\n\nReset your password here:\n${url}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email.`,
        }),
      });
      if (!res.ok) {
        console.error("Resend error (password reset):", await res.text());
      }
    },
  },
  socialProviders: {
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
    ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ? {
          microsoft: {
            clientId: process.env.MICROSOFT_CLIENT_ID,
            clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
            tenantId: process.env.MICROSOFT_TENANT_ID || "common",
          },
        }
      : {}),
  },
  // Attach our own custom fields (role, companyId) onto the session/user object Better
  // Auth returns, so the rest of the app can keep reading session.user.role etc. the
  // same way it always has.
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "INSPECTOR" },
      companyId: { type: "string", required: false },
    },
  },
  plugins: [
    twoFactor({
      issuer: "ProptMate",
    }),
  ],
});
