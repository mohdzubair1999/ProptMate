import type { Metadata } from "next";
import Link from "next/link";
import { safeNextPath } from "@/lib/safeRedirect";

export const metadata: Metadata = {
  title: "Session expired",
  // a page people are sent to, not something to find in a search
  robots: { index: false, follow: false },
};

// Public on purpose: it is shown to people who are, by definition, not signed in. It reads no session and no data,
// so it can never fail for want of one.
export default async function SessionExpiredPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const sp = await searchParams;
  const next = safeNextPath(Array.isArray(sp.next) ? sp.next[0] : sp.next); // forged links cannot send anyone elsewhere
  const loginHref = `/login?reason=expired${next ? `&next=${encodeURIComponent(next)}` : ""}`;

  return (
    <main className="min-h-screen bg-paper flex items-center justify-center px-6">
      <div className="w-full max-w-md">
        <Link href="/" className="font-display font-700 text-lg text-ink">
          ProptMate
        </Link>
        <div className="mt-8 bg-white border border-line rounded-xl p-8">
          <h1 className="font-display font-700 text-2xl text-ink">Your session has expired</h1>
          <p className="mt-3 text-slate leading-relaxed">
            For your security, ProptMate signs you out after about a week without use. Anything you had saved is safe.
          </p>
          <Link href={loginHref} className="mt-6 block w-full text-center bg-signal text-white rounded-full py-2.5 font-medium hover:opacity-90 transition-opacity">
            Sign in again
          </Link>
          {next && <p className="mt-3 text-sm text-slate text-center">You will come straight back to what you were doing.</p>}
        </div>
        <p className="mt-6 text-sm text-slate text-center">
          <Link href="/" className="underline hover:text-ink">
            Go to the home page
          </Link>
        </p>
      </div>
    </main>
  );
}
