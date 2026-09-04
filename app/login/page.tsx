"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import Link from "next/link";
import { Suspense } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justReset = searchParams.get("reset") === "1";
  const justDeleted = searchParams.get("deleted") === "1";
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn.email(
      { email: form.email, password: form.password },
      {
        onSuccess(context) {
          // Checked explicitly here rather than relying solely on the plugin's own
          // onTwoFactorRedirect config — this is the pattern Better Auth's own docs show
          // most consistently, and having both is a safety net, not a conflict, since only
          // one path actually runs depending on whether 2FA is required.
          if ((context.data as any)?.twoFactorRedirect) {
            window.location.href = "/two-factor-verify";
          }
        },
      }
    );
    setLoading(false);

    if (res.error) {
      setError("Invalid email or password");
      return;
    }

    // If 2FA was required, onSuccess above already redirected — this only runs for accounts
    // without 2FA enabled, where the session is already fully established.
    if (!(res.data as any)?.twoFactorRedirect) {
      const role = (res.data?.user as any)?.role;
      router.push(role === "CLIENT" ? "/portal" : "/dashboard");
    }
  };

  return (
    <>
      {justReset && (
        <div className="mt-6 bg-verified/10 border border-verified/20 rounded-lg p-3">
          <p className="text-sm text-verified">Your password has been reset — log in with your new password below.</p>
        </div>
      )}

      {justDeleted && (
        <div className="mt-6 bg-white border border-line rounded-lg p-3">
          <p className="text-sm text-slate">Your account has been permanently deleted.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="text-sm text-slate">Email</label>
          <input type="email" required onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-slate">Password</label>
            <Link href="/forgot-password" className="text-xs text-slate hover:text-ink underline">
              Forgot password?
            </Link>
          </div>
          <input type="password" required onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading} className="w-full bg-signal text-white rounded-full py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>

      <button onClick={() => signIn.social({ provider: "google", callbackURL: "/dashboard" })} className="mt-3 w-full border border-line rounded-full py-2.5 font-medium text-ink hover:border-ink transition-colors">
        Continue with Google
      </button>
      <button onClick={() => signIn.social({ provider: "microsoft", callbackURL: "/dashboard" })} className="mt-2 w-full border border-line rounded-full py-2.5 font-medium text-ink hover:border-ink transition-colors">
        Continue with Microsoft
      </button>

      <p className="text-sm text-slate mt-6 text-center">
        Don't have an account?{" "}
        <Link href="/signup" className="text-ink underline">
          Get started free
        </Link>
      </p>
    </>
  );
}

export default function Login() {
  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display font-700 text-lg text-ink">
          ProptMate
        </Link>
        <h1 className="font-display font-600 text-2xl text-ink mt-6">Log in</h1>

        {/* useSearchParams needs a Suspense boundary in Next.js — without it the page fails
            to prerender at build time. */}
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
