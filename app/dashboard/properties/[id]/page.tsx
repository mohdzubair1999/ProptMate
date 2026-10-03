import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import { deleteProperty } from "@/lib/actions/properties";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import QrIssueReportsList from "./qr-issue-reports-list";
import { calculatePropertyHealthScore } from "@/lib/propertyHealthScore";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const property = await prisma.property.findUnique({
    where: { id: id },
    include: {
      inspections: { orderBy: { createdAt: "desc" }, include: { inspector: true, items: { select: { condition: true } } } },
      qrIssueReports: { orderBy: { createdAt: "desc" } },
      complianceDocuments: { select: { expiryDate: true } },
    },
  });

  if (!property) notFound();

  const healthScore = calculatePropertyHealthScore({
    itemConditions: property.inspections[0]?.items.map((i) => i.condition).filter((c): c is string => !!c) || [],
    complianceExpiryDates: property.complianceDocuments.map((d) => d.expiryDate),
    openIssueCount: property.qrIssueReports.filter((r) => r.status !== "resolved").length,
  });

  const qrUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://proptmate.zkmholdingslimited.com"}/qr/${property.id}`;
  const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: 300, margin: 1 });

  return (
    <main>
      <Link href="/dashboard/properties" className="text-sm text-slate hover:text-ink">
        ← Back to properties
      </Link>

      <div className="flex items-start justify-between mt-4 flex-wrap gap-3">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">{property.address}</h1>
          {(property.city || property.postcode) && (
            <p className="text-sm text-slate mt-0.5">{[property.city, property.postcode].filter(Boolean).join(", ")}</p>
          )}
          <p className="text-sm text-slate mt-1 capitalize">
            {property.type}
            {property.bedrooms != null && ` · ${property.bedrooms} bed${property.bedrooms === 1 ? "" : "s"}`}
            {property.landlordName && ` · Client: ${property.landlordName}`}
          </p>
          <div className="mt-2 inline-flex items-center gap-2">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                healthScore.band === "good" ? "bg-verified/10 text-verified" : healthScore.band === "fair" ? "bg-signal/10 text-signal" : "bg-red-100 text-red-700"
              }`}
              title={`Condition: ${healthScore.components.condition ?? "no inspection yet"} · Compliance: ${healthScore.components.compliance} · Open issues: ${healthScore.components.openIssues}`}
            >
              Health {healthScore.score}
            </span>
            <Link href={`/dashboard/properties/${property.id}/timeline`} className="text-xs px-2.5 py-1 rounded-full font-medium bg-line/40 text-slate hover:text-ink transition-colors">
              Condition timeline
            </Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/dashboard/properties/${property.id}/edit`} className="border border-line text-ink px-4 py-2 rounded-full text-sm font-medium hover:border-ink transition-colors">
            Edit
          </Link>
          <Link href={`/dashboard/inspections/new?propertyId=${property.id}`} className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
            New inspection
          </Link>
        </div>
      </div>

      <form action={deleteProperty} className="mt-4">
        <input type="hidden" name="propertyId" value={property.id} />
        <ConfirmSubmitButton
          confirmMessage={`Permanently delete "${property.address}" and all ${property.inspections.length} inspection(s) under it? This cannot be undone.`}
          className="text-xs text-red-600 hover:text-red-700 underline"
        >
          Delete this property
        </ConfirmSubmitButton>
      </form>

      {property.notes && <p className="mt-4 text-sm text-slate bg-white border border-line rounded-xl p-4">{property.notes}</p>}

      <div className="mt-6 bg-white border border-line rounded-xl p-5 flex items-center gap-5 flex-wrap">
        <img src={qrCodeDataUrl} alt="QR code for this property" width={120} height={120} className="rounded-lg border border-line" />
        <div>
          <h3 className="font-display font-600 text-ink">Property QR code</h3>
          <p className="text-sm text-slate mt-1 max-w-md">
            Print this and put it up at the property. Staff who scan it can jump straight into starting an inspection; anyone else can report a problem without needing an account.
          </p>
          <a href={qrCodeDataUrl} download={`proptmate-qr-${property.id}.png`} className="inline-block mt-2 text-sm text-signal hover:underline">
            Download QR code
          </a>
        </div>
      </div>

      <QrIssueReportsList reports={property.qrIssueReports.map((r) => ({ id: r.id, description: r.description, photoUrl: r.photoUrl, reporterName: r.reporterName, reporterContact: r.reporterContact, status: r.status, createdAt: r.createdAt.toISOString() }))} />

      <p className="text-xs text-slate mt-6">
        Tenants, landlords, and compliance documents for this property are now managed from{" "}
        <Link href="/dashboard/tenants" className="text-signal hover:underline">
          Tenants &amp; Landlords
        </Link>{" "}
        and{" "}
        <Link href="/dashboard/compliance" className="text-signal hover:underline">
          Compliance
        </Link>{" "}
        in the sidebar.
      </p>

      <h2 className="font-display font-600 text-lg text-ink mt-10">Inspections</h2>

      {property.inspections.length === 0 ? (
        <p className="text-sm text-slate mt-3">No inspections yet for this property.</p>
      ) : (
        <div className="mt-4 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-slate">
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Inspector</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {property.inspections.map((i) => (
                <tr key={i.id} className="border-b border-line last:border-0">
                  <td className="px-6 py-4 capitalize">
                    <Link href={`/dashboard/inspections/${i.id}`} className="text-ink hover:text-signal">
                      {i.type}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-slate">{i.inspector.name || i.inspector.email}</td>
                  <td className="px-6 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full ${i.status === "completed" ? "bg-verified/10 text-verified" : "bg-signal/10 text-signal"}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate">{i.scheduledDate ? formatDate(i.scheduledDate) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}
    </main>
  );
}
