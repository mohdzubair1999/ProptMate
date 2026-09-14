"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { resetPassword } from "@/lib/auth-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    if (!token) {
      setError("This reset link is invalid — request a new one below.");
      return;
    }

    setLoading(true);
    const res = await resetPassword({ newPassword, token });
    setLoading(false);

    if (!res.error) {
      router.push("/login?reset=1");
    } else {
      // The most common real cause here is the token having expired (1 hour) or already
      // being used — both look the same from Better Auth's response, so a single message
      // covers it without guessing at the internal reason.
      setError("This reset link is invalid or has expired — request a new one below.");
    }
  };

  if (!token) {
    return (
      <div className="mt-6 bg-white border border-line rounded-xl p-6">
        <p className="text-sm text-slate">This reset link is missing its token — it may have been copied incorrectly.</p>
        <Link href="/forgot-password" className="inline-block mt-3 text-sm text-ink underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <div>
        <label className="text-sm text-slate">New password</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>
      <div>
        <label className="text-sm text-slate">Confirm new password</label>
        <input
          type="password"
          required
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
      </div>

      {error && (
        <div>
          <p className="text-sm text-red-600">{error}</p>
          {error.includes("invalid or has expired") && (
            <Link href="/forgot-password" className="text-sm text-ink underline mt-1 inline-block">
              Request a new reset link
            </Link>
          )}
        </div>
      )}

      <button type="submit" disabled={loading} className="w-full bg-signal text-white rounded-full py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
        {loading ? "Resetting…" : "Reset password"}
      </button>
    </form>
  );
}

export default function ResetPassword() {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display font-700 text-lg text-ink">
          ProptMate
        </Link>
        <h1 className="font-display font-600 text-2xl text-ink mt-6">Set a new password</h1>

        {/* useSearchParams needs a Suspense boundary in Next.js — without it the page fails
            to prerender at build time. */}
        <Suspense fallback={<p className="text-sm text-slate mt-6">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
