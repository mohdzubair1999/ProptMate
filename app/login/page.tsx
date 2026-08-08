"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import Link from "next/link";

export default function Login() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn.email({ email: form.email, password: form.password });
    setLoading(false);

    if (!res.error) {
      const role = (res.data?.user as any)?.role;
      router.push(role === "CLIENT" ? "/portal" : "/dashboard");
    } else setError("Invalid email or password");
  };

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display font-700 text-lg text-ink">
          ProptMate
        </Link>
        <h1 className="font-display font-600 text-2xl text-ink mt-6">Log in</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm text-slate">Email</label>
            <input type="email" required onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Password</label>
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
      </div>
    </main>
  );
}
