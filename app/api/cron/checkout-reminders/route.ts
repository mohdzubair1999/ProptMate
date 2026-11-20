import { hasCronSecret } from "@/lib/safeEqual";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkOutEmail, dueForReminder } from "@/lib/tenancyEnd";
import { sendPlainEmail } from "@/lib/sendEmail";
import { getMainAdminEmail } from "@/lib/getMainAdminEmail";

// Daily: emails the inspector (and the main admin) about check-outs coming up in the next three days. Each one is reminded once.
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!hasCronSecret(authHeader)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const soon = await prisma.inspection.findMany({
    where: {
      type: "check-out", status: "draft", deletedAt: null, checkOutReminderSentAt: null,
      scheduledDate: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
      property: { archivedAt: null },
    },
    select: { id: true, type: true, status: true, scheduledDate: true, checkOutReminderSentAt: true, inspector: { select: { email: true } }, property: { select: { address: true, companyId: true } } },
    take: 200,
  });
  let sent = 0;
  for (const i of soon) {
    if (!dueForReminder(i, now)) continue;
    const admin = await getMainAdminEmail(i.property.companyId);
    const mail = checkOutEmail({ address: i.property.address, when: i.scheduledDate });
    const ok = await sendPlainEmail([i.inspector.email, admin].filter((e): e is string => !!e).filter((e, n, a) => a.indexOf(e) === n), mail.subject, mail.lines);
    if (ok) { await prisma.inspection.update({ where: { id: i.id }, data: { checkOutReminderSentAt: new Date() } }); sent++; }
  }
  return NextResponse.json({ checked: soon.length, sent });
}
