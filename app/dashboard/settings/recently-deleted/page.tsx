import Link from "next/link";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { getDeletedInspections, restoreInspection, permanentlyDeleteInspection } from "@/lib/actions/inspections";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

export default async function RecentlyDeletedPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const role = (session.user as any).role as string;
  if (role !== "ADMIN" && role !== "MANAGER") {
    redirect("/dashboard/settings");
  }

  const inspections = await getDeletedInspections();

  return (
    <main>
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>

      <h1 className="font-display font-700 text-2xl text-ink mt-4">Recently deleted</h1>
      <p className="text-sm text-slate mt-1">
        Deleting an inspection here doesn't erase it right away — it moves here first, fully intact, until you either restore it or choose to delete it
        permanently.
      </p>

      {inspections.length === 0 ? (
        <section className="mt-6 bg-white border border-line rounded-xl p-10 text-center">
          <p className="text-slate text-sm">Nothing here — deleted inspections will show up in this list.</p>
        </section>
      ) : (
        <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-slate">
                  <th className="px-6 py-3 font-medium">Property</th>
                  <th className="px-6 py-3 font-medium">Type</th>
                  <th className="px-6 py-3 font-medium">Deleted</th>
                  <th className="px-6 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((inspection) => (
                  <tr key={inspection.id} className="border-b border-line last:border-0">
                    <td className="px-6 py-3 text-ink">{inspection.property.address}</td>
                    <td className="px-6 py-3 text-ink capitalize">{inspection.type}</td>
                    <td className="px-6 py-3 text-slate whitespace-nowrap">
                      {inspection.deletedAt?.toLocaleDateString("en-GB")} {inspection.deletedAt?.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3 justify-end">
                        <form action={restoreInspection}>
                          <input type="hidden" name="inspectionId" value={inspection.id} />
                          <button type="submit" className="text-sm text-verified hover:underline">
                            Restore
                          </button>
                        </form>
                        <form action={permanentlyDeleteInspection}>
                          <input type="hidden" name="inspectionId" value={inspection.id} />
                          <ConfirmSubmitButton
                            confirmMessage={`Permanently delete the ${inspection.type} inspection for ${inspection.property.address}? This cannot be undone — the report, photos, and all answers will be gone for good.`}
                            className="text-sm text-red-600 hover:underline"
                          >
                            Delete permanently
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
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
