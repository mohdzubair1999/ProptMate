import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/formatDate";
import { removeClientAccess } from "@/lib/actions/portal";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import SearchFilterBar from "@/components/SearchFilterBar";
import RelationSelect from "../properties/[id]/relation-select";
import InviteClientForm from "./invite-client-form";
import EditClientProfileForm from "./edit-client-profile-form";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; relation?: string }>;
}) {
  const params = await searchParams;
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;

  const q = params.q?.trim();
  const relation = params.relation;

  const properties = companyId
    ? await prisma.property.findMany({
        where: { companyId },
        select: { id: true, address: true },
        orderBy: { address: "asc" },
      })
    : [];

  const access = companyId
    ? await prisma.propertyAccess.findMany({
        where: {
          property: { companyId },
          ...(relation ? { relation: relation as any } : {}),
          ...(q
            ? {
                OR: [
                  { user: { name: { contains: q, mode: "insensitive" } } },
                  { user: { email: { contains: q, mode: "insensitive" } } },
                  { property: { address: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
        include: {
          user: {
            include: {
              assignedInspections: {
                orderBy: { createdAt: "desc" },
                select: { id: true, type: true, status: true, propertyId: true, completedDate: true },
              },
            },
          },
          property: { select: { id: true, address: true } },
          linkedReports: {
            include: { inspection: { select: { id: true, type: true, completedDate: true, report: { select: { pdfUrl: true, generatedAt: true } } } } },
          },
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

  // Finished, generated PDF reports across all company properties - a different concept from
  // "self-service forms" (inspections a tenant fills out themselves): this is the actual
  // completed report staff generated. Used both to show relevant reports on each existing
  // tenant/landlord's card below, and to let staff pick which report(s) a new invite should
  // be linked to - scoped to every property (not just ones with existing access records), so
  // it works for a property that doesn't have any tenants linked yet either.
  const reportedInspections = await prisma.inspection.findMany({
    where: { propertyId: { in: properties.map((p) => p.id) }, report: { isNot: null }, deletedAt: null },
    select: { id: true, type: true, propertyId: true, completedDate: true, report: { select: { pdfUrl: true, generatedAt: true } } },
    orderBy: { completedDate: "desc" },
  });

  return (
    <main>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-700 text-2xl text-ink">Tenants &amp; Landlords</h1>
          <p className="text-sm text-slate mt-1">Everyone with self-service portal access, across your whole portfolio.</p>
        </div>
      </div>

      <SearchFilterBar
        searchPlaceholder="Search by name, email, or property address..."
        filters={[
          {
            param: "relation",
            label: "All",
            options: [
              { value: "TENANT", label: "Tenants" },
              { value: "LANDLORD", label: "Landlords" },
            ],
          },
        ]}
      />

      <details className="mt-4 bg-white border border-line rounded-xl p-4">
        <summary className="text-sm text-slate cursor-pointer hover:text-ink">+ Invite a tenant or landlord</summary>
        <InviteClientForm properties={properties} reports={reportedInspections} />
      </details>

      {access.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">No one matches your search.</p>
        </section>
      ) : (
        <div className="mt-6 space-y-2">
          {access.map((a) => (
            <div key={a.id} className="bg-white border border-line rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{a.user.name || a.user.email}</p>
                  <div className="text-xs text-slate mt-0.5 flex items-center gap-2 flex-wrap">
                    {a.user.email} ·{" "}
                    <span>{a.property.address}</span>{" "}
                    · <RelationSelect accessId={a.id} initialRelation={a.relation} />
                  </div>
                </div>
                <form action={removeClientAccess}>
                  <input type="hidden" name="accessId" value={a.id} />
                  <ConfirmSubmitButton confirmMessage={`Remove ${a.user.email}'s access to ${a.property.address}?`} className="text-xs text-red-600 hover:text-red-700 underline shrink-0">
                    Remove
                  </ConfirmSubmitButton>
                </form>
              </div>

              {(() => {
                const forThisProperty = a.user.assignedInspections.filter((i) => i.propertyId === a.property.id);
                if (forThisProperty.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-line space-y-1">
                    <p className="text-xs text-slate">Self-service forms:</p>
                    {forThisProperty.map((i) => (
                      <a
                        key={i.id}
                        href={`/dashboard/inspections/${i.id}`}
                        className="flex items-center justify-between text-sm hover:bg-paper rounded px-2 py-1.5 -mx-2 transition-colors"
                      >
                        <span className="capitalize text-ink">{i.type.replace("-", " ")}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${i.status === "completed" ? "bg-verified/10 text-verified" : "bg-signal/10 text-signal"}`}>
                          {i.status === "completed" ? `Submitted ${i.completedDate ? formatDate(i.completedDate) : ""}` : "Not yet submitted"}
                        </span>
                      </a>
                    ))}
                  </div>
                );
              })()}

              {(() => {
                if (a.linkedReports.length === 0) return null;
                return (
                  <div className="mt-3 pt-3 border-t border-line space-y-1">
                    <p className="text-xs text-slate">Reports:</p>
                    {a.linkedReports.map((link) =>
                      link.inspection.report?.pdfUrl ? (
                        <a
                          key={link.id}
                          href={link.inspection.report.pdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between text-sm hover:bg-paper rounded px-2 py-1.5 -mx-2 transition-colors"
                        >
                          <span className="capitalize text-ink">{link.inspection.type.replace("-", " ")}</span>
                          <span className="text-xs text-slate">
                            {link.inspection.completedDate
                              ? formatDate(link.inspection.completedDate)
                              : formatDate(link.inspection.report.generatedAt)}{" "}
                            · 📄 View
                          </span>
                        </a>
                      ) : null
                    )}
                  </div>
                );
              })()}

              <details className="mt-3">
                <summary className="text-xs text-slate cursor-pointer hover:text-ink">Edit name / email</summary>
                <EditClientProfileForm userId={a.userId} propertyId={a.property.id} initialName={a.user.name || ""} initialEmail={a.user.email} />
              </details>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
