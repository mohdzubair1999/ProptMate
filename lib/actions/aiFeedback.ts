"use server";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { cleanMissNote, pickMissKind, pickMissMode, MISS_HOURLY_LIMIT } from "@/lib/aiFeedback";

export async function reportAiMiss(input: { inspectionId?: string; kind?: string; mode?: string; note?: string }): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  const user = session?.user as { id?: string; email?: string | null; companyId?: string | null } | undefined;
  if (!user?.id || !user.companyId) return { error: "Please sign in again" };
  const note = cleanMissNote(input?.note);
  if (!note) return { error: "Please say what was missed (a few words is enough)" };
  const recent = await prisma.aiMissReport.count({ where: { companyId: user.companyId, userId: user.id, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= MISS_HOURLY_LIMIT) return { error: "That's a lot of reports in an hour. Please try again later" };
  // only an inspection of the signed-in company can be attached
  let inspectionId: string | null = null;
  if (typeof input.inspectionId === "string" && input.inspectionId) {
    const own = await prisma.inspection.findFirst({ where: { id: input.inspectionId, property: { companyId: user.companyId } }, select: { id: true } });
    inspectionId = own?.id ?? null;
  }
  await prisma.aiMissReport.create({ data: { companyId: user.companyId, userId: user.id, userEmail: user.email ?? "", inspectionId, kind: pickMissKind(input.kind), mode: pickMissMode(input.mode), note } });
  return { ok: true };
}
