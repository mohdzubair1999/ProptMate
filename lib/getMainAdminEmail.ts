import { prisma } from "@/lib/prisma";

// The earliest-created Admin-role user for a company - a reasonable, simple definition of
// "the main admin" given there's no dedicated company-level contact-email field yet. This is
// typically the person who originally signed the company up for ProptMate.
export async function getMainAdminEmail(companyId: string | null): Promise<string | null> {
  if (!companyId) return null;
  const admin = await prisma.user.findFirst({
    where: { companyId, role: "ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { email: true },
  });
  return admin?.email || null;
}
