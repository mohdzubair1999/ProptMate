import Link from "next/link";
import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import AccountDangerZone from "./account-danger-zone";
import TwoFactorSettings from "./two-factor-settings";

export default async function AccountSettingsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const companyId = (session.user as any).companyId as string | null;
  const otherUsersInCompany = companyId
    ? await prisma.user.count({ where: { companyId, id: { not: session.user.id } } })
    : 0;
  const soleUser = !companyId || otherUsersInCompany === 0;

  const fullUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { twoFactorEnabled: true } });

  return (
    <main>
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>

      <h1 className="font-display font-700 text-2xl text-ink mt-4">Account</h1>
      <p className="text-sm text-slate mt-1">Manage your security, export your data, or permanently delete your account.</p>

      <div className="mt-8 space-y-6">
        <TwoFactorSettings initiallyEnabled={!!fullUser?.twoFactorEnabled} />
        <AccountDangerZone soleUser={soleUser} />
      </div>
    </main>
  );
}
