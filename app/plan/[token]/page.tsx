import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadSharedPlan } from "@/lib/floorPlanShareData";
import { buildSharedSheets, sharedSheetDataUri } from "@/lib/floorPlanShare";

// A public, read-only view of a floor plan, for anyone holding the link. Never indexed by search engines, and never
// cached: turning sharing off must take effect at once.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Floor plan", robots: { index: false, follow: false, nocache: true }, referrer: "no-referrer" };

export default async function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const plan = await loadSharedPlan(token);
  if (!plan) notFound();
  const sheets = buildSharedSheets(plan);

  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <p className="text-xs uppercase tracking-wide text-slate">{plan.companyName}</p>
        <h1 className="font-display font-700 text-2xl text-ink mt-1" data-testid="shared-address">{plan.address}</h1>
        <p className="text-sm text-slate mt-1">Floor plan · read-only</p>

        {sheets.length === 0 ? (
          <p className="mt-8 text-sm text-slate" data-testid="shared-empty">This floor plan doesn&apos;t have a saved drawing to show yet.</p>
        ) : (
          <div className="mt-6 space-y-8">
            {sheets.map((s) => (
              <section key={s.index} className="bg-white border border-line rounded-xl p-4" data-testid="shared-sheet">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h2 className="font-display font-600 text-lg text-ink">{s.name}</h2>
                  <a href={`/api/plan/${token}/pdf?floor=${s.index}`} className="text-sm rounded-full px-4 py-1.5 bg-signal text-white font-medium" data-testid="shared-pdf-link">
                    Download PDF
                  </a>
                </div>
                {/* An SVG shown as an image can never run script or load anything - it is only a picture. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sharedSheetDataUri(s.svg)} alt={`Floor plan of ${plan.address}: ${s.name}`} className="w-full h-auto border border-line rounded" />
              </section>
            ))}
          </div>
        )}
        <p className="mt-8 text-xs text-slate">Shared by {plan.companyName} using ProptMate. Measurements are approximate and for illustration only.</p>
      </div>
    </main>
  );
}
