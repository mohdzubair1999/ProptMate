import { betterAuth } from "better-auth";
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
});
