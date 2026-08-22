import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields, twoFactorClient } from "better-auth/client/plugins";

export const { signIn, signUp, signOut, useSession, requestPasswordReset, resetPassword, twoFactor } = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [
    inferAdditionalFields(), // so session.user includes our custom role/companyId
    twoFactorClient({
      // Runs when sign-in succeeds but the account has 2FA enabled — the session isn't
      // fully established yet at this point, so this sends them to enter their code before
      // they can actually reach the dashboard.
      onTwoFactorRedirect: () => {
        window.location.href = "/two-factor-verify";
      },
    }),
  ],
});
