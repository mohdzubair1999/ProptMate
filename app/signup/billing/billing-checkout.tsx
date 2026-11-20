"use client";

import { useState, useCallback } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { createCheckoutSession } from "@/lib/actions/billing";
import PricingCards from "@/components/PricingCards";
import type { DisplayPlan } from "@/lib/plans";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

export default function BillingCheckout({ plans }: { plans: DisplayPlan[] }) {
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
        <PricingCards
          plans={plans}
          onSelect={(tier) => {
            setError("");
            setSelectedPlan(tier);
          }}
        />
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
