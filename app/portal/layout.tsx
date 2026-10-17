import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import Link from "next/link";
import PortalSignOut from "./sign-out-button";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const role = ((session.user as any).role as string) || "";
  if (role !== "CLIENT") redirect("/dashboard");

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/portal" className="font-display font-700 text-lg text-ink">
            ProptMate
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate">{session.user.email}</span>
            <PortalSignOut />
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-10">{children}</main>
    </div>
  );
}
