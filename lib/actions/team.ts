"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auditLog";

async function requireAdmin() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const companyId = (session.user as any).companyId as string | null;
  if (role !== "ADMIN") throw new Error("Only an Admin can manage team members");
  if (!companyId) throw new Error("No company associated with this account");
  return { companyId, actingUserId: session.user.id as string, actingUserEmail: session.user.email as string };
}

// A thrown Error from a server action bound directly to a <form action> has no error boundary to
// catch it, so it used to surface to the user as a blank "Application error" page - this is how a
// duplicate-email signup just crashed the team page in production. Both actions below instead
// return { error } for anything the user can actually cause, which the client form displays
// inline. redirect()'s own internal "throw" is deliberately let through, never treated as a failure.
function isRedirectThrow(err: unknown): boolean {
  return !!err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
}

export async function addTeamMember(_prevState: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  try {
    const { companyId, actingUserId, actingUserEmail } = await requireAdmin();

    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const role = String(formData.get("role") || "INSPECTOR") as any;

    if (!name || !email || !password) return { error: "Name, email and password are required" };
    if (password.length < 8) return { error: "Password must be at least 8 characters" };

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // removeTeamMember never deletes an account - it only clears companyId, so their past
      // inspection work stays attached to the same user id. Someone re-added here by an Admin
      // is almost always that same person coming back, not a genuinely new signup, so this
      // reattaches their existing account instead of a confusing "already exists" - but only
      // when it's unambiguously safe to: the account must not already belong to an active
      // company (never silently steal someone else's staff account), and must not be a tenant
      // or landlord portal login (a CLIENT account was never a team member to begin with).
      if (existing.companyId || existing.role === "CLIENT") {
        return { error: "An account with that email already exists" };
      }

      const hashed = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: existing.id }, data: { name, role, companyId, emailVerified: true } });

      // Give them the freshly-entered password rather than leaving whatever they had before -
      // the admin is handing this over directly, same as for a brand new member - by updating
      // their existing credential row rather than creating a second one.
      const existingAccount = await prisma.account.findFirst({ where: { userId: existing.id, providerId: "credential" } });
      if (existingAccount) {
        await prisma.account.update({ where: { id: existingAccount.id }, data: { password: hashed } });
      } else {
        await prisma.account.create({ data: { userId: existing.id, providerId: "credential", accountId: existing.id, password: hashed } });
      }

      await logAuditEvent({
        companyId,
        userId: actingUserId,
        userEmail: actingUserEmail,
        action: "team.reactivated",
        entityType: "User",
        entityId: existing.id,
        description: `Re-added ${name} (${email}) as ${role} - their previous history stays attached`,
      });

      revalidatePath("/dashboard/settings/team");
      return {};
    }

    const hashed = await bcrypt.hash(password, 10);

    // Better Auth stores passwords in the Account table, not on User directly — a "credential"
    // account with accountId equal to the user's own id, matching Better Auth's own convention.
    const user = await prisma.user.create({ data: { name, email, role, companyId, emailVerified: true } });
    await prisma.account.create({
      data: { userId: user.id, providerId: "credential", accountId: user.id, password: hashed },
    });

    await logAuditEvent({
      companyId,
      userId: actingUserId,
      userEmail: actingUserEmail,
      action: "team.invited",
      entityType: "User",
      entityId: user.id,
      description: `Added ${name} (${email}) as ${role}`,
    });

    revalidatePath("/dashboard/settings/team");
    return {};
  } catch (err) {
    if (isRedirectThrow(err)) throw err;
    return { error: err instanceof Error ? err.message : "Couldn't add this team member — please try again." };
  }
}

export async function removeTeamMember(_prevState: { error?: string } | undefined, formData: FormData): Promise<{ error?: string }> {
  try {
    const { companyId, actingUserId, actingUserEmail } = await requireAdmin();
    const userId = String(formData.get("userId") || "");
    if (!userId) return { error: "No team member was specified" };

    if (userId === actingUserId) return { error: "You can't remove yourself" };

    const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!target) return { error: "Team member not found - they may already have been removed" };

    // Detach them from any inspections rather than deleting inspection history
    await prisma.user.update({ where: { id: userId }, data: { companyId: null } });

    await logAuditEvent({
      companyId,
      userId: actingUserId,
      userEmail: actingUserEmail,
      action: "team.removed",
      entityType: "User",
      entityId: userId,
      description: `Removed ${target.name || target.email} from the team`,
    });

    revalidatePath("/dashboard/settings/team");
    return {};
  } catch (err) {
    if (isRedirectThrow(err)) throw err;
    return { error: err instanceof Error ? err.message : "Couldn't remove this team member — please try again." };
  }
}
