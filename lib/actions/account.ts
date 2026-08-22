"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return session.user as any;
}

// GDPR "right to portability" — everything reasonably tied to this person's account and
// company, as a single structured JSON object they can keep or hand to another service.
export async function exportMyData(): Promise<{ error?: string; data?: any }> {
  const user = await requireUser();

  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { company: true },
  });
  if (!fullUser) return { error: "User not found." };

  const companyId = fullUser.companyId;

  const [properties, inspections, templates] = companyId
    ? await Promise.all([
        prisma.property.findMany({
          where: { companyId },
          include: { complianceDocuments: true },
        }),
        prisma.inspection.findMany({
          where: { property: { companyId } },
          include: {
            items: { include: { photos: true } },
            answers: { include: { photos: true } },
            report: true,
            property: { select: { address: true } },
            inspector: { select: { name: true, email: true } },
          },
        }),
        prisma.template.findMany({
          where: { companyId },
          include: { sections: { include: { fields: true } } },
        }),
      ])
    : [[], [], []];

  return {
    data: {
      exportedAt: new Date().toISOString(),
      account: {
        name: fullUser.name,
        email: fullUser.email,
        role: fullUser.role,
        createdAt: fullUser.createdAt,
      },
      company: fullUser.company ? { name: fullUser.company.name, createdAt: fullUser.company.createdAt } : null,
      properties,
      inspections,
      templates,
    },
  };
}

// GDPR "right to erasure". Two genuinely different cases, handled differently on purpose:
// if this person is the only user in their company, deleting their account removes
// everything — there's no one else whose access this would affect. If there are other team
// members, deleting this one account must NOT destroy data the rest of the team still
// depends on — it only removes this person's own user record and access.
export async function deleteMyAccount(formData: FormData): Promise<{ error?: string }> {
  const user = await requireUser();
  const password = String(formData.get("password") || "");
  const confirmText = String(formData.get("confirmText") || "");

  if (confirmText !== "DELETE") {
    return { error: 'Please type "DELETE" to confirm.' };
  }

  // Verify the current password directly against the stored hash — the same bcrypt setup
  // already used everywhere else in auth.ts — rather than relying on client-provided
  // identity alone for something this irreversible.
  const account = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (!account?.password) {
    return { error: "This account doesn't have a password set (e.g. Google/Microsoft sign-in) — contact support to delete your account." };
  }
  const validPassword = await bcrypt.compare(password, account.password);
  if (!validPassword) {
    return { error: "Incorrect password." };
  }

  const companyId = (user as any).companyId as string | null;
  const otherUsersInCompany = companyId
    ? await prisma.user.count({ where: { companyId, id: { not: user.id } } })
    : 0;

  if (companyId && otherUsersInCompany === 0) {
    // Sole user — wipe the whole company's data. Ordered so every delete respects its
    // foreign keys: children before parents, and the self-referencing inspection comparison
    // link cleared before inspections themselves are removed.
    await prisma.$transaction([
      prisma.photo.deleteMany({ where: { inspectionItem: { inspection: { property: { companyId } } } } }),
      prisma.photo.deleteMany({ where: { fieldAnswer: { inspection: { property: { companyId } } } } }),
      prisma.inspectionItem.deleteMany({ where: { inspection: { property: { companyId } } } }),
      prisma.fieldAnswer.deleteMany({ where: { inspection: { property: { companyId } } } }),
      prisma.report.deleteMany({ where: { inspection: { property: { companyId } } } }),
      prisma.inspection.updateMany({ where: { property: { companyId } }, data: { comparedToInspectionId: null } }),
      prisma.inspection.deleteMany({ where: { property: { companyId } } }),
      // ComplianceDocument cascades automatically when its Property is deleted.
      prisma.property.deleteMany({ where: { companyId } }),
      prisma.templateField.deleteMany({ where: { section: { template: { companyId } } } }),
      prisma.templateSection.deleteMany({ where: { template: { companyId } } }),
      prisma.template.deleteMany({ where: { companyId } }),
      // Session/Account/PropertyAccess cascade automatically when the User is deleted.
      prisma.user.deleteMany({ where: { companyId } }),
      prisma.company.delete({ where: { id: companyId } }),
    ]);
  } else {
    // Other team members still depend on the shared company data — only remove this one
    // user's own record. Sessions/Accounts/PropertyAccess cascade automatically.
    await prisma.user.delete({ where: { id: user.id } });
  }

  redirect("/login?deleted=1");
}
