import Link from "next/link";

export default function PrivacyPage() {
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
        <h1 className="font-display font-700 text-4xl text-ink">Privacy Policy</h1>
        <p className="mt-3 text-sm text-slate">Last updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="mt-8 space-y-8 text-slate leading-relaxed text-sm">
          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">1. Who we are</h2>
            <p>ProptMate provides property inspection and inventory software for letting agents and property managers. This policy explains what personal data we collect, why, and how we handle it, in line with UK GDPR and the Data Protection Act 2018.</p>
            <p className="mt-2">Where you use ProptMate to manage inspections, tenants, or landlords on behalf of your own business, you act as the data controller for that data, and ProptMate acts as the data processor — you're responsible for having a lawful basis to collect and share that information with us, and we process it only on your instructions and to provide the service.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">2. What we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account information</strong> — name, email address, and password (stored securely, never in plain text).</li>
              <li><strong>Property and inspection data</strong> — addresses, photos, notes, and condition records you or your team enter.</li>
              <li><strong>Tenant and landlord contact details</strong> — where you invite them to use the self-service portal.</li>
              <li><strong>Payment information</strong> — handled entirely by Stripe; we never see or store your full card details.</li>
              <li><strong>Usage data</strong> — basic technical information like IP address and browser type, for security and troubleshooting.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">3. How we use it</h2>
            <p>To provide the service itself (generating reports, sending emails, processing payments), to keep your account secure, to respond when you contact us, and to meet our legal obligations. We do not sell your data.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">4. Who we share it with</h2>
            <p>We use trusted third-party providers to run the service: Stripe (payments), Resend (email delivery), Vercel and Supabase (hosting and database), and Anthropic (AI-assisted features like photo analysis and certificate reading). Each only receives the data needed to perform their specific function.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">5. How long we keep it</h2>
            <p>We keep your data for as long as your account is active, and for a reasonable period afterward where required for legal, accounting, or dispute-resolution purposes (for example, inspection records that may be relevant to a tenancy deposit dispute).</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">6. Your rights</h2>
            <p>Under UK GDPR, you can ask to access, correct, delete, or export your personal data, and you can object to or restrict certain uses of it. Contact us using the details below to exercise any of these rights.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">7. Contact us</h2>
            <p>
              Questions about this policy or your data — <Link href="/contact" className="text-signal hover:underline">get in touch here</Link>.
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
