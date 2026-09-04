"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { twoFactor, useSession } from "@/lib/auth-client";

export default function TwoFactorVerify() {
  const router = useRouter();
  const { data: session } = useSession();

  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  // Redirect once the session actually reflects a verified, fully-authenticated user —
  // reacting to real session state here rather than guessing at the verify response's exact
  // shape, since I wasn't fully certain it echoes back the user's role directly.
  useEffect(() => {
    if (verified && session?.user) {
      const role = (session.user as any).role;
      router.push(role === "CLIENT" ? "/portal" : "/dashboard");
    }
  }, [verified, session, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = useBackupCode ? await twoFactor.verifyBackupCode({ code }) : await twoFactor.verifyTotp({ code, trustDevice: true });

    setLoading(false);

    if (res.error) {
      setError(useBackupCode ? "That backup code wasn't recognised — it may already have been used." : "That code didn't match — check your authenticator app and try again.");
      return;
    }

    setVerified(true);
  };

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display font-700 text-lg text-ink">
          ProptMate
        </Link>
        <h1 className="font-display font-600 text-2xl text-ink mt-6">Verify it's you</h1>
        <p className="text-sm text-slate mt-2">
          {useBackupCode ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <input
              type="text"
              required
              autoFocus
              inputMode={useBackupCode ? "text" : "numeric"}
              maxLength={useBackupCode ? 12 : 6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal tracking-widest text-center text-lg"
              placeholder={useBackupCode ? "backup code" : "000000"}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="w-full bg-signal text-white rounded-full py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>

        <button
          onClick={() => {
            setUseBackupCode(!useBackupCode);
            setCode("");
            setError("");
          }}
          className="text-sm text-slate hover:text-ink underline mt-4 block mx-auto"
        >
          {useBackupCode ? "Use your authenticator app instead" : "Use a backup code instead"}
        </button>
      </div>
    </main>
  );
}
