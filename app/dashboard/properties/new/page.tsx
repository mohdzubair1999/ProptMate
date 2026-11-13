import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import NewPropertyForm from "./new-property-form";

export default async function NewPropertyPage() {
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null | undefined;
  const clients: { id: string; name: string; address: string | null }[] = companyId ? await prisma.clientContact.findMany({ where: { companyId }, select: { id: true, name: true, address: true }, orderBy: { name: "asc" } }) : [];
  return (
    <main className="max-w-lg">
      <Link href="/dashboard/properties" className="text-sm text-slate hover:text-ink">
        ← Back to properties
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Add property</h1>

      <NewPropertyForm clients={clients} />
    </main>
  );
}
