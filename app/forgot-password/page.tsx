"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth-client";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await requestPasswordReset({ email, redirectTo: "/reset-password" });
    setLoading(false);

    // Better Auth deliberately reports success even for an unknown email, to avoid leaking
    // which addresses have accounts — so this always shows the same message either way.
    if (!res.error) setSent(true);
    else setError("Something went wrong — please try again in a moment.");
  };

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display font-700 text-lg text-ink">
          ProptMate
        </Link>
        <h1 className="font-display font-600 text-2xl text-ink mt-6">Reset your password</h1>

        {sent ? (
          <div className="mt-6 bg-white border border-line rounded-xl p-6">
            <p className="text-sm text-slate">
              If an account exists for <strong className="text-ink">{email}</strong>, we've sent a link to reset your password. It expires in 1 hour.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate mt-2">Enter your email and we'll send you a link to reset it.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="text-sm text-slate">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <button type="submit" disabled={loading} className="w-full bg-signal text-white rounded-full py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                {loading ? "Sending…" : "Send reset link"}
              </button>
            </form>
          </>
        )}

        <p className="text-sm text-slate mt-6 text-center">
          <Link href="/login" className="text-ink underline">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
