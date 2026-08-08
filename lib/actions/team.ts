"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  const companyId = (session.user as any).companyId as string | null;
  if (role !== "ADMIN") throw new Error("Only an Admin can manage team members");
  if (!companyId) throw new Error("No company associated with this account");
  return companyId;
}

export async function addTeamMember(formData: FormData) {
  const companyId = await requireAdmin();

  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "INSPECTOR") as any;

  if (!name || !email || !password) throw new Error("Name, email and password are required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("An account with that email already exists");

  const hashed = await bcrypt.hash(password, 10);

  // Better Auth stores passwords in the Account table, not on User directly — a "credential"
  // account with accountId equal to the user's own id, matching Better Auth's own convention.
  const user = await prisma.user.create({ data: { name, email, role, companyId, emailVerified: true } });
  await prisma.account.create({
    data: { userId: user.id, providerId: "credential", accountId: user.id, password: hashed },
  });

  revalidatePath("/dashboard/settings/team");
}

export async function removeTeamMember(formData: FormData) {
  const companyId = await requireAdmin();
  const userId = String(formData.get("userId") || "");
  if (!userId) return;

  const session = await getSession();
  if (userId === (session?.user as any)?.id) throw new Error("You can't remove yourself");

  const target = await prisma.user.findFirst({ where: { id: userId, companyId } });
  if (!target) throw new Error("Team member not found");

  // Detach them from any inspections rather than deleting inspection history
  await prisma.user.update({ where: { id: userId }, data: { companyId: null } });

  revalidatePath("/dashboard/settings/team");
}
