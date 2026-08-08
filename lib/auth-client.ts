import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

export const { signIn, signUp, signOut, useSession } = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL,
  plugins: [inferAdditionalFields()], // so session.user includes our custom role/companyId
});
