import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import QrReportForm from "./qr-report-form";

export default async function QrLandingPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { id: true, address: true, city: true, companyId: true },
  });

  if (!property) {
    return (
      <main className="min-h-screen bg-paper flex items-center justify-center px-6">
        <p className="text-slate">This QR code doesn't match a known property.</p>
      </main>
    );
  }

  const session = await getSession();
  const isStaffForThisProperty = session?.user && (session.user as any).companyId === property.companyId && (session.user as any).role !== "CLIENT";

  return (
    <main className="min-h-screen bg-paper px-6 py-10">
      <div className="max-w-md mx-auto">
        <h1 className="font-display font-700 text-xl text-ink">{property.address}</h1>
        {property.city && <p className="text-sm text-slate mt-0.5">{property.city}</p>}

        {isStaffForThisProperty ? (
          <div className="mt-6 bg-white border border-line rounded-xl p-5">
            <p className="text-sm text-slate">You're signed in as staff for this property.</p>
            <Link
              href={`/dashboard/inspections/new?propertyId=${property.id}`}
              className="inline-block mt-4 bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Start an inspection
            </Link>
            <Link href={`/dashboard/properties/${property.id}`} className="block mt-3 text-sm text-slate hover:text-ink">
              View property details
            </Link>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-sm text-slate">Spotted a problem with this property? Let us know below - no account needed.</p>
            <QrReportForm propertyId={property.id} />
          </div>
        )}
      </div>
    </main>
  );
}
