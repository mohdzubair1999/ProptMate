import Link from "next/link";

export default function TermsPage() {
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
        <h1 className="font-display font-700 text-4xl text-ink">Terms of Service</h1>
        <p className="mt-3 text-sm text-slate">Last updated {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</p>

        <div className="mt-8 space-y-8 text-slate leading-relaxed text-sm">
          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">1. Agreement</h2>
            <p>By creating an account or using ProptMate, you agree to these terms. If you're using ProptMate on behalf of a company, you're confirming you have the authority to bind that company to these terms.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">2. Your account</h2>
            <p>You're responsible for keeping your login details secure and for all activity that happens under your account. Let us know right away if you suspect unauthorised access.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">3. Subscriptions and billing</h2>
            <p>Paid plans are billed monthly via Stripe. Free trials convert to a paid subscription automatically unless cancelled before the trial ends. You can cancel anytime from your billing settings; cancellation takes effect at the end of the current billing period.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">4. Your content and our platform</h2>
            <p>You retain ownership of the inspection data, photos, and reports you create using ProptMate. You're responsible for the accuracy of the information you enter — ProptMate is a tool to help you record and report on property condition, not a substitute for your own professional judgement. In turn, ProptMate and its underlying software, design, and branding remain our property; nothing in these terms transfers ownership of the platform itself to you.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">5. Acceptable use</h2>
            <p>Don't use ProptMate for anything unlawful, to store or share content you don't have the right to use, or to attempt to disrupt or gain unauthorised access to the service. We may suspend or terminate accounts that breach this section, with notice where reasonably practicable.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">6. Availability</h2>
            <p>We aim to keep ProptMate available and reliable, but we don't guarantee uninterrupted access — occasional downtime for maintenance or issues outside our control can happen, and we're not liable for losses arising from such downtime.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">7. Limitation of liability</h2>
            <p>ProptMate is provided "as is," and to the fullest extent permitted by law we exclude all warranties, conditions, and representations not expressly stated in these terms. Our total liability to you for any claim arising from your use of the service, however it arises, is limited to the amount you paid us in the 12 months before the claim. We are not liable for any indirect, special, or consequential loss, including loss of profits, business, or data. Nothing in these terms limits or excludes liability where the law does not allow it — including liability for fraud, or for death or personal injury caused by our negligence.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">8. Indemnity</h2>
            <p>You agree to indemnify and hold ProptMate harmless against any claims, losses, or costs arising from your misuse of the service, your breach of these terms, or content you upload that infringes someone else's rights.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">9. Termination</h2>
            <p>You can stop using ProptMate and cancel your subscription at any time. We may suspend or terminate your access if you materially breach these terms, including non-payment, and we'll aim to give reasonable notice except where immediate action is needed to protect the service or other users.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">10. Governing law</h2>
            <p>These terms are governed by the law of England and Wales, and any disputes will be handled by the courts of England and Wales.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">11. Changes</h2>
            <p>We may update these terms from time to time. If we make significant changes, we'll let you know.</p>
          </div>

          <div>
            <h2 className="font-display font-600 text-lg text-ink mb-2">12. Contact</h2>
            <p>
              Questions about these terms — <Link href="/contact" className="text-signal hover:underline">get in touch here</Link>.
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
