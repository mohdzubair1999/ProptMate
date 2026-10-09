"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auditLog";

// redirect()'s own internal "throw" must pass through untouched, not be reported as a form error.
function isRedirectThrow(err: unknown): boolean {
  return !!err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
}

// A website is optional. Anything typed is turned into a proper web address, and anything that
// isn't a plain http(s) link is refused - this value ends up as a clickable link inside every PDF
// report, so "javascript:", "data:", "mailto:" and the like must never get through.
function normaliseWebsite(raw: string): { url: string | null; error?: string } {
  const v = raw.trim();
  if (!v) return { url: null };
  if (v.length > 200) return { url: null, error: "That website address is too long." };
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(v);
  const candidate = hasScheme ? v : `https://${v}`;
  let u: URL;
  try {
    u = new URL(candidate);
  } catch {
    return { url: null, error: "That doesn't look like a web address, e.g. https://yourcompany.com" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { url: null, error: "The website must start with http:// or https://" };
  if (u.username || u.password) return { url: null, error: "Leave out any username or password from the website address." };
  if (!u.hostname.includes(".")) return { url: null, error: "That doesn't look like a web address, e.g. https://yourcompany.com" };
  return { url: u.pathname === "/" && !u.search && !u.hash ? u.origin : u.toString() };
}

export type CompanyDetailsState = { error?: string; saved?: { name: string; website: string | null } };

// What the company is called, and its website - both printed in the header of every page of its
// reports after the cover (the name links to the website). A company's name is set once at
// signup, so without this a mistake or a missing "Limited" there could never be corrected.
// Admin only, and only ever the caller's own company.
export async function updateCompanyDetails(_prevState: CompanyDetailsState | undefined, formData: FormData): Promise<CompanyDetailsState> {
  try {
    const session = await getSession();
    if (!session?.user) redirect("/login");
    const user = session.user as any;
    const companyId = user.companyId as string | null;
    if (!companyId) return { error: "Your account isn't linked to a company yet." };
    if (user.role !== "ADMIN") return { error: "Only an Admin can change the company details." };

    const name = String(formData.get("name") || "")
      .replace(/[\u0000-\u001F\u007F]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 2 || name.length > 100) return { error: "Company name must be between 2 and 100 characters." };

    const site = normaliseWebsite(String(formData.get("website") || ""));
    if (site.error) return { error: site.error };

    const existing = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, website: true } });
    if (!existing) return { error: "Company not found." };
    if (existing.name === name && (existing.website ?? null) === site.url) return { saved: { name, website: site.url } };

    await prisma.company.update({ where: { id: companyId }, data: { name, website: site.url } });

    const changes: string[] = [];
    if (existing.name !== name) changes.push(`name from "${existing.name}" to "${name}"`);
    if ((existing.website ?? null) !== site.url) changes.push(`website from ${existing.website ?? "none"} to ${site.url ?? "none"}`);
    await logAuditEvent({
      companyId,
      userId: user.id,
      userEmail: user.email,
      action: "company.updated",
      entityType: "Company",
      entityId: companyId,
      description: `Changed the company ${changes.join(" and ")}`,
    });

    revalidatePath("/dashboard/settings/account");
    revalidatePath("/dashboard/profile");
    return { saved: { name, website: site.url } };
  } catch (err) {
    if (isRedirectThrow(err)) throw err;
    return { error: err instanceof Error ? err.message : "Couldn't save the company details - please try again." };
  }
}
