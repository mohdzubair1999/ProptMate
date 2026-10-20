"use server";

import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

// Runs immediately after signUp.email() on the client — Better Auth has already created
// the user and signed them in (autoSignIn is on by default), so we can read the session
// here, create their company, and promote them to Admin of it.
export async function completeSignup(companyName: string) {
  const session = await getSession();
  if (!session?.user) throw new Error("Not signed in");

  const company = await prisma.company.create({ data: { name: companyName } });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { companyId: company.id, role: "ADMIN" },
  });
}
