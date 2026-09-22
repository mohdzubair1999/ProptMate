import { getSession } from "@/lib/session";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addTeamMember, removeTeamMember } from "@/lib/actions/team";
import ConfirmSubmitButton from "@/components/ConfirmSubmitButton";

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
                    {m.id !== currentUserId && (
                      <form action={removeTeamMember}>
                        <input type="hidden" name="userId" value={m.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Remove ${m.name} from the team? Their past inspection work stays on record, but they'll lose access.`}
                          className="text-xs text-red-600 hover:text-red-700 underline"
                        >
                          Remove
                        </ConfirmSubmitButton>
                      </form>
                    )}
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
          <form action={addTeamMember} className="mt-4 space-y-4 max-w-sm">
            <div>
              <label className="text-sm text-slate">Name</label>
              <input name="name" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
            </div>
            <div>
              <label className="text-sm text-slate">Email</label>
              <input name="email" type="email" required className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
            </div>
            <div>
              <label className="text-sm text-slate">Temporary password</label>
              <input name="password" type="password" required minLength={8} className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal" />
              <p className="text-xs text-slate mt-1">Share this with them directly — they can log in and it stays as-is unless they change it.</p>
            </div>
            <div>
              <label className="text-sm text-slate">Role</label>
              <select name="role" className="mt-1 w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal">
                <option value="INSPECTOR">Inspector</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
                <option value="CLIENT">Client</option>
              </select>
            </div>
            <button type="submit" className="bg-signal text-white px-5 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity">
              Add team member
            </button>
          </form>
        </section>
      ) : (
        <p className="text-sm text-slate mt-6">Only an Admin can add or remove team members.</p>
      )}
    </main>
  );
}
