import Link from "next/link";
import { getSession } from "@/lib/session";

export const metadata = { title: "Download your data" };

export default async function ExportPage() {
  const session = await getSession();
  const user = session?.user as any;
  const companyId = user?.companyId as string | null | undefined;
  const allowed = user?.role === "ADMIN" || user?.role === "MANAGER";
  return (
    <main className="max-w-2xl">
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">← Back to settings</Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Download your data</h1>
      <p className="text-sm text-slate mt-1">One ZIP with your properties, inspections, inventory items, photo links, compliance documents and report PDFs, as spreadsheets and PDFs. Useful if you are leaving, or for a data request.</p>
      {!allowed ? <p className="text-sm text-slate mt-4" data-testid="export-not-allowed">Only an Admin or Manager can download the company&apos;s data.</p> : (
        <div className="mt-5 space-y-4">
          <div className="bg-white border border-line rounded-xl p-5">
            <h2 className="font-display font-600 text-ink">Everything</h2>
            <a href="/api/export/all" data-testid="export-all" className="inline-block mt-3 bg-signal text-white px-4 py-2 rounded-full text-sm font-medium">Download everything (ZIP)</a>
          </div>
          <p className="text-sm text-slate">To download just one property, open it from Properties and use &quot;Download this property&apos;s data&quot;.</p>
          <p className="text-xs text-slate">Up to 40 report PDFs (50 MB) go inside the ZIP. Any others are listed with a link in inspections.csv. You can download a full copy a few times an hour.</p>
        </div>
      )}
    </main>
  );
}
