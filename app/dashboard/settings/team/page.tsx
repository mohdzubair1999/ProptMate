import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AddTeamMemberForm from "./add-team-member-form";
import RemoveTeamMemberButton from "./remove-team-member-button";

export default async function TeamPage() {
  const session = await getSession();
  const companyId = (session?.user as any)?.companyId as string | null;
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const currentUserId = (session?.user as any)?.id as string;

  const members = companyId ? await prisma.user.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }) : [];

  return (
    <main className="max-w-2xl">
      <Link href="/dashboard/settings" className="text-sm text-slate hover:text-ink">
        ← Back to settings
      </Link>
      <h1 className="font-display font-700 text-2xl text-ink mt-4">Team</h1>
      <p className="text-sm text-slate mt-1">{members.length} member{members.length !== 1 ? "s" : ""}</p>

      <div className="mt-6 bg-white border border-line rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-slate">
              <th className="px-6 py-3 font-medium">Name</th>
              <th className="px-6 py-3 font-medium">Email</th>
              <th className="px-6 py-3 font-medium">Role</th>
              {isAdmin && <th className="px-6 py-3 font-medium"></th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="px-6 py-4">
                  {m.name} {m.id === currentUserId && <span className="text-xs text-slate">(you)</span>}
                </td>
                <td className="px-6 py-4 text-slate">{m.email}</td>
                <td className="px-6 py-4">
                  <span className="text-xs px-2 py-1 rounded-full bg-signal/10 text-signal uppercase">{m.role}</span>
                </td>
                {isAdmin && (
                  <td className="px-6 py-4 text-right">
                    {m.id !== currentUserId && <RemoveTeamMemberButton userId={m.id} memberName={m.name || m.email} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {isAdmin ? (
        <section className="mt-8 bg-white border border-line rounded-xl p-6">
          <h2 className="font-display font-600 text-lg text-ink">Add a team member</h2>
          <AddTeamMemberForm />
        </section>
      ) : (
        <p className="text-sm text-slate mt-6">Only an Admin can add or remove team members.</p>
      )}
    </main>
  );
}
