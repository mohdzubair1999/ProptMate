import Link from "next/link";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import ClientsManager from "./clients-manager";

type ClientRow = { id: string; name: string; address: string | null; email: string | null; phone: string | null; _count: { properties: number } };
type RecipientRow = { id: string; email: string; name: string | null; useCount: number };

export default async function ClientDetailsPage() {
  const session = await getSession();
  const user = session?.user as any;
  const companyId = user?.companyId as string | null | undefined;
  const canRemove = user?.role === "ADMIN" || user?.role === "MANAGER";

  const [clients, recipients]: [ClientRow[], RecipientRow[]] = companyId
    ? await Promise.all([
        prisma.clientContact.findMany({ where: { companyId }, orderBy: { name: "asc" }, include: { _count: { select: { properties: true } } } }),
        prisma.sentRecipient.findMany({ where: { companyId }, orderBy: { lastUsedAt: "desc" }, take: 200 }),
      ])
    : [[], []];

  return (
    <main className="max-w-3xl">
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Client details</h1>
      <p className="text-sm text-slate mt-1">
        Save a client once. Choose it on a property and every new inspection fills in the summary&apos;s client name and address by itself. Saved clients&apos; email addresses are also suggested when you type a few letters in the send box.
      </p>
      <ClientsManager
        clients={clients.map((c: ClientRow) => ({ id: c.id, name: c.name, address: c.address, email: c.email, phone: c.phone, properties: c._count.properties }))}
        recipients={recipients.map((r: RecipientRow) => ({ id: r.id, email: r.email, name: r.name, useCount: r.useCount }))}
        canRemove={canRemove}
      />
    </main>
  );
}
