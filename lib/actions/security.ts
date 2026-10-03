"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// Deliberately Admin-only, not Manager - unlike most company-scoped actions in this app,
// blocking an IP is a platform-wide decision that could affect any company's tenants trying
// to report an issue through their own QR code, not something scoped to one agency.
async function requireAdmin() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const role = (session.user as any).role as string;
  if (role !== "ADMIN") throw new Error("Only an Admin can do this");
  return session.user.id as string;
}

export async function blockIp(formData: FormData) {
  const userId = await requireAdmin();
  const ipAddress = String(formData.get("ipAddress") || "").trim();
  const reason = String(formData.get("reason") || "").trim() || "Blocked from security dashboard";
  if (!ipAddress || ipAddress === "unknown") throw new Error("Invalid IP address");

  await prisma.blockedIp.upsert({
    where: { ipAddress },
    create: { ipAddress, reason, blockedByUserId: userId },
    update: { reason, blockedByUserId: userId },
  });

  revalidatePath("/dashboard/settings/security");
}

export async function unblockIp(formData: FormData) {
  await requireAdmin();
  const ipAddress = String(formData.get("ipAddress") || "").trim();
  await prisma.blockedIp.deleteMany({ where: { ipAddress } });
  revalidatePath("/dashboard/settings/security");
}
