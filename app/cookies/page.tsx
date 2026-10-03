import Link from "next/link";

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-paper">
      <nav className="flex items-center justify-between px-6 sm:px-10 py-6">
        <Link href="/" className="font-display font-700 text-lg tracking-tight text-ink">
          ProptMate
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate hover:text-ink transition-colors">
            Log in
          </Link>
        </div>
      </nav>

      <section className="px-6 sm:px-10 py-16 max-w-3xl mx-auto">
        <h1 className="font-display font-700 text-4xl text-ink">Cookie Policy</h1>
        <p className="mt-3 text-sm text-slate">Last updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="mt-8 space-y-6 text-slate leading-relaxed text-sm">
          <p>ProptMate uses a small number of cookies — not for advertising or tracking, but because the service genuinely needs them to work.</p>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">Strictly necessary cookies</h2>
            <p>These keep you signed in and keep your session secure. Without them, you'd need to log in again on every single page. These can't be switched off, since the service can't function without them.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">Payment cookies</h2>
            <p>When you go through checkout, Stripe sets its own cookies to process payment securely and prevent fraud. These are set by Stripe directly, not by ProptMate.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">What we don't use</h2>
            <p>No advertising cookies, no third-party tracking or analytics cookies that follow you across other sites.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">Managing cookies</h2>
            <p>Most browsers let you block or delete cookies in their settings. Blocking the necessary ones above will prevent you from being able to log in, since they're essential to how the service works.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">Questions</h2>
            <p>
              <Link href="/contact" className="text-signal hover:underline">Get in touch</Link> if you have any questions about this policy.
            </p>
          </div>
        </div>
      </section>

      <footer className="px-6 sm:px-10 py-10 border-t border-line text-center text-sm text-slate">
        © {new Date().getFullYear()} ProptMate. All rights reserved.
      </footer>
    </main>
  );
}
