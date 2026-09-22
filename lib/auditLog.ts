import { prisma } from "./prisma";

// Deliberately scoped to meaningful, discrete events — property/inspection/compliance/team
// changes — rather than every micro-interaction like each auto-saved field edit. Logging
// every keystroke-triggered save would flood this with noise and make it useless for
// actually answering "who changed what, when."
export async function logAuditEvent({
  companyId,
  userId,
  userEmail,
  action,
  entityType,
  entityId,
  description,
}: {
  companyId: string;
  userId: string | null;
  userEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
}) {
  try {
    await prisma.auditLog.create({
      data: { companyId, userId, userEmail, action, entityType, entityId, description },
    });
  } catch (err) {
    // Never let a logging failure block the actual action the user was trying to take —
    // losing one audit entry is far better than failing someone's real property/inspection
    // edit because of a problem in a background bookkeeping call.
    console.error("Audit log write failed:", err);
  }
}
