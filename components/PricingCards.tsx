"use client";

import Link from "next/link";
import type { DisplayPlan } from "@/lib/plans";

// The plan cards: used by the public pricing page (each card links on) and by the plan picker at sign-up (each card selects a plan)
export default function PricingCards({ plans, ctaLabel = "Start free trial", href, onSelect }: { plans: DisplayPlan[]; ctaLabel?: string; href?: string; onSelect?: (tier: string) => void }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="pricing-cards">
      {plans.map((plan) => {
        const cta = `mt-6 w-full py-2.5 rounded-full text-sm font-medium text-center transition-opacity hover:opacity-90 ${plan.popular ? "bg-signal text-white" : "bg-ink text-white"}`;
        return (
          <div key={plan.tier} data-plan={plan.tier} className={`relative flex flex-col rounded-2xl p-6 bg-white transition-all ${plan.popular ? "border-2 border-signal shadow-lg shadow-signal/10" : "border border-line"}`}>
            {plan.popular && <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-signal text-white text-xs font-medium px-3 py-1 rounded-full">Most popular</span>}
            <p className="font-display font-700 text-lg text-ink">{plan.name}</p>
            <p className="text-xs text-slate mt-0.5">{plan.limit}</p>
            <div className="mt-4 flex items-baseline gap-1">
              <span className="font-display font-700 text-3xl text-ink" data-testid="plan-price">{plan.priceText}</span>
              <span className="text-sm text-slate">/month</span>
            </div>
            <ul className="mt-5 space-y-2.5 flex-1">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-slate">
                  <span className="text-verified mt-0.5">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(plan.tier)} className={cta}>{ctaLabel}</button>
            ) : (
              <Link href={href ?? "/signup"} className={`block ${cta}`}>{ctaLabel}</Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
