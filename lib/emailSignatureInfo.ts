import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import type { SignatureInfo } from "@/lib/emailSignature";

// Who is sending: the signed-in staff member and their company. Never throws: if anything is missing the signature simply falls back to the settings.
export async function getSignatureInfo(companyId: string | null): Promise<SignatureInfo> {
  try {
    const session = await getSession();
    const user = session?.user as { name?: string | null; email?: string | null } | undefined;
    const company = companyId ? await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, website: true } }) : null;
    return { name: user?.name ?? null, email: user?.email ?? null, company: company?.name ?? null, website: company?.website ?? null };
  } catch {
    return {};
  }
}
