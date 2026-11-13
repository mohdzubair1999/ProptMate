import type { Metadata } from "next";
import Link from "next/link";
import PricingCards from "@/components/PricingCards";
import { TRIAL_DAYS, displayPlans } from "@/lib/plans";
import { getLivePrices } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Pricing — ProptMate",
  description: `Simple monthly plans for property inspections, with a ${TRIAL_DAYS}-day free trial on every plan.`,
};

export const revalidate = 600;

export default async function PricingPage() {
  const plans = displayPlans(await getLivePrices());
  return (
    <div className="min-h-screen bg-paper flex flex-col">
      <nav className="flex items-center justify-between px-6 sm:px-10 py-6">
        <Link href="/" className="font-display font-700 text-lg tracking-tight text-ink">ProptMate</Link>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-slate hover:text-ink transition-colors">Log in</Link>
          <Link href="/signup" className="text-sm bg-ink text-white px-4 py-2 rounded-full hover:bg-signal transition-colors">Get started free</Link>
        </div>
      </nav>
      <main className="flex-1 px-6 sm:px-10 py-10">
        <div className="max-w-6xl mx-auto">
          <h1 className="font-display font-700 text-3xl sm:text-4xl text-ink text-center">Simple, monthly pricing</h1>
          <p className="text-slate text-center mt-3" data-testid="pricing-trial">{TRIAL_DAYS}-day free trial on any plan — cancel anytime before it ends and you won't be charged.</p>
          <div className="mt-12">
            <PricingCards plans={plans} />
          </div>
          <p className="text-sm text-slate text-center mt-10">
            Need more than {plans[plans.length - 1].propertyLimit} properties, or something different?{" "}
            <Link href="/contact" className="text-ink underline">Get in touch</Link>.
          </p>
        </div>
      </main>
      <footer className="px-6 sm:px-10 py-10 border-t border-line">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate">
          <Link href="/about" className="hover:text-ink transition-colors">About</Link>
          <Link href="/help" className="hover:text-ink transition-colors">Help &amp; Tutorials</Link>
          <Link href="/contact" className="hover:text-ink transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-ink transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-ink transition-colors">Terms of Service</Link>
        </div>
      </footer>
    </div>
  );
}
