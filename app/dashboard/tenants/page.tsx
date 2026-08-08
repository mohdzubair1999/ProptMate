import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { inviteClient, removeClientAccess, updateClientProfile } from "@/lib/actions/portal";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";
import SearchFilterBar from "@/components/SearchFilterBar";
import RelationSelect from "../properties/[id]/relation-select";

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
        },
        orderBy: { createdAt: "desc" },
      })
    : [];

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
        <form action={inviteClient} className="mt-4 grid grid-cols-2 gap-3 max-w-lg">
          <div className="col-span-2">
            <label className="text-sm text-slate">Property</label>
            <select name="propertyId" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
              <option value="">Select a property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm text-slate">Name</label>
            <input name="name" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Email</label>
            <input name="email" type="email" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <div>
            <label className="text-sm text-slate">Relationship</label>
            <select name="relation" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
              <option value="TENANT">Tenant</option>
              <option value="LANDLORD">Landlord</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate">Temporary password</label>
            <input name="password" type="password" minLength={8} placeholder="If new account" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
          </div>
          <p className="col-span-2 text-xs text-slate">Share the password with them directly. If their email already has portal access elsewhere, leave it blank.</p>
          <button type="submit" className="col-span-2 bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity w-fit">
            Invite
          </button>
        </form>
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
                          {i.status === "completed" ? `Submitted ${i.completedDate ? new Date(i.completedDate).toLocaleDateString() : ""}` : "Not yet submitted"}
                        </span>
                      </a>
                    ))}
                  </div>
                );
              })()}

              <details className="mt-3">
                <summary className="text-xs text-slate cursor-pointer hover:text-ink">Edit name / email</summary>
                <form action={updateClientProfile} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="userId" value={a.userId} />
                  <input type="hidden" name="propertyId" value={a.property.id} />
                  <div>
                    <label className="text-xs text-slate">Name</label>
                    <input name="name" required defaultValue={a.user.name || ""} className="mt-1 block border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                  </div>
                  <div>
                    <label className="text-xs text-slate">Email</label>
                    <input name="email" type="email" required defaultValue={a.user.email} className="mt-1 block border border-line rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
                  </div>
                  <button type="submit" className="bg-ink text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-signal transition-colors">
                    Save
                  </button>
                </form>
                <p className="text-xs text-slate mt-1">Changing the email changes what they log in with.</p>
              </details>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
