"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { createCheckoutSession } from "@/lib/actions/billing";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

const PLANS = [
  {
    tier: "starter",
    name: "Starter",
    price: 25,
    limit: "Up to 30 properties",
    features: ["Unlimited inspections", "AI photo analysis", "Compliance tracking", "1 team member"],
  },
  {
    tier: "growth",
    name: "Growth",
    price: 49,
    limit: "Up to 100 properties",
    features: ["Everything in Starter", "Self-service tenant portal", "Cross-report comparison", "5 team members"],
    popular: true,
  },
  {
    tier: "scale",
    name: "Scale",
    price: 99,
    limit: "Up to 300 properties",
    features: ["Everything in Growth", "Priority support", "Unlimited team members"],
  },
  {
    tier: "enterprise",
    name: "Enterprise",
    price: 149,
    limit: "Up to 400 properties",
    features: ["Everything in Scale", "Dedicated onboarding", "Custom contract terms"],
  },
];

export default function BillingCheckout() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [error, setError] = useState("");

  const fetchClientSecret = useCallback(async () => {
    if (!selectedPlan) throw new Error("No plan selected");
    const { clientSecret } = await createCheckoutSession(selectedPlan);
    if (!clientSecret) throw new Error("Couldn't start checkout");
    return clientSecret;
  }, [selectedPlan]);

  if (!selectedPlan) {
    return (
      <div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`relative flex flex-col rounded-2xl p-6 bg-white transition-all ${
                plan.popular ? "border-2 border-signal shadow-lg shadow-signal/10" : "border border-line"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-signal text-white text-xs font-medium px-3 py-1 rounded-full">
                  Most popular
                </span>
              )}

              <p className="font-display font-700 text-lg text-ink">{plan.name}</p>
              <p className="text-xs text-slate mt-0.5">{plan.limit}</p>

              <div className="mt-4 flex items-baseline gap-1">
                <span className="font-display font-700 text-3xl text-ink">£{plan.price}</span>
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

              <button
                onClick={() => {
                  setError("");
                  setSelectedPlan(plan.tier);
                }}
                className={`mt-6 w-full py-2.5 rounded-full text-sm font-medium transition-opacity hover:opacity-90 ${
                  plan.popular ? "bg-signal text-white" : "bg-ink text-white"
                }`}
              >
                Start free trial
              </button>
            </div>
          ))}
        </div>
        {error && <p className="mt-4 text-sm text-red-600 text-center">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button onClick={() => setSelectedPlan(null)} className="text-sm text-slate hover:text-ink mb-4">
        ← Choose a different plan
      </button>
      <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
