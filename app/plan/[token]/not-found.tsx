import type { Metadata } from "next";

// What someone sees when a shared floor plan link does not work. The wording is the same whether the link was never valid, was turned
// off, or has expired, so it reveals nothing about which (and it is a proper 404, so it is never indexed or cached as a real page).
export const metadata: Metadata = { title: "Link not available", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default function SharedPlanNotFound() {
  return (
    <main className="min-h-screen bg-paper px-4 py-16">
      <div className="max-w-md mx-auto text-center">
        <h1 className="font-display font-700 text-2xl text-ink" data-testid="shared-unavailable">
          This link isn&apos;t available
        </h1>
        <p className="text-sm text-slate mt-3">
          It may have expired, or the person who shared it may have turned it off. Please ask them for a new link.
        </p>
      </div>
    </main>
  );
}
