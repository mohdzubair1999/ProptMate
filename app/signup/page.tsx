"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signUp } from "@/lib/auth-client";
import { completeSignup } from "@/lib/actions/signup";
import Link from "next/link";

export default function Signup() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Step 1: Better Auth creates the user and signs them in
    const res = await signUp.email({ email: form.email, password: form.password, name: form.name });

    if (res.error) {
      setError(res.error.message || "Something went wrong");
      setLoading(false);
      return;
    }

    // Step 2: now that they have a session, create their company and become its Admin
    try {
      await completeSignup(form.companyName);
      router.push("/signup/billing");
    } catch {
      setError("Account created, but something went wrong setting up your company. Try logging in.");
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display font-700 text-lg text-ink">
          ProptMate
        </Link>
        <h1 className="font-display font-600 text-2xl text-ink mt-6">Create your account</h1>
        <p className="text-sm text-slate mt-1">You'll be set up as the Admin for your company.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="text-sm text-slate">Company name</label>
            <input name="companyName" required onChange={handleChange} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Your name</label>
            <input name="name" required onChange={handleChange} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Email</label>
            <input name="email" type="email" required onChange={handleChange} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Password</label>
            <input name="password" type="password" required minLength={8} onChange={handleChange} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="w-full bg-signal text-white rounded-full py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <button onClick={() => signIn.social({ provider: "google", callbackURL: "/dashboard" })} className="mt-3 w-full border border-line rounded-full py-2.5 font-medium text-ink hover:border-ink transition-colors">
          Continue with Google
        </button>
        <button onClick={() => signIn.social({ provider: "microsoft", callbackURL: "/dashboard" })} className="mt-2 w-full border border-line rounded-full py-2.5 font-medium text-ink hover:border-ink transition-colors">
          Continue with Microsoft
        </button>

        <p className="text-sm text-slate mt-6 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-ink underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
