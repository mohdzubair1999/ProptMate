// How often one address may try the sign-in family of requests. Slows down password guessing, code guessing, mass sign-ups and
// reset-email flooding without getting in a real person's way. Pure rules, used by app/api/auth/[...all]/route.ts.
export type AuthLimit = { name: string; max: number; windowMinutes: number };

const RULES: { match: RegExp; limit: AuthLimit }[] = [
  { match: /^\/api\/auth\/sign-in\/email\/?$/, limit: { name: "sign-in", max: 10, windowMinutes: 10 } },
  { match: /^\/api\/auth\/sign-up\/email\/?$/, limit: { name: "sign-up", max: 6, windowMinutes: 60 } },
  { match: /^\/api\/auth\/(forget-password|request-password-reset|send-verification-email)\/?$/, limit: { name: "password-email", max: 5, windowMinutes: 30 } },
  { match: /^\/api\/auth\/reset-password\/?$/, limit: { name: "password-reset", max: 8, windowMinutes: 30 } },
  { match: /^\/api\/auth\/two-factor\/(verify-totp|verify-backup-code|verify-otp)\/?$/, limit: { name: "two-factor", max: 10, windowMinutes: 10 } },
  { match: /^\/api\/auth\/change-password\/?$/, limit: { name: "change-password", max: 8, windowMinutes: 30 } },
];

export function authLimitFor(method: string, pathname: string): AuthLimit | null {
  if (String(method).toUpperCase() !== "POST") return null;
  const hit = RULES.find((r) => r.match.test(String(pathname)));
  return hit ? hit.limit : null;
}
