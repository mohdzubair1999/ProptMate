import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import ImportProperties from "./import-properties";

export const metadata = { title: "Import properties" };

export default async function ImportPropertiesPage() {
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null | undefined;
  if (!companyId) notFound(); // an account with no company has nowhere to import to
  return (
    <div>
      <Link href="/dashboard/properties" className="text-sm text-slate hover:text-ink">← Properties</Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-2 mb-1">Import properties</h1>
      <p className="text-sm text-slate mb-6">Add many properties at once from a spreadsheet. You will see exactly what will happen to each row before anything is saved.</p>
      <ImportProperties />
    </div>
  );
}
