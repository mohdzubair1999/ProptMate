"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/auditLog";
import { cleanClientInput, deleteClient, saveClient, type ClientDb } from "@/lib/clientContacts";
import { forgetRecipient, type SuggestDb } from "@/lib/emailSuggestions";

// Saved clients (Settings, Client details). Staff of a company can add and edit; only an Admin or a Manager can delete a client or remove a remembered address.
// Portal clients (role CLIENT) can do none of it. Everything is limited to the person's own company.
function isRedirectThrow(err: unknown): boolean {
  return !!err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
}
async function requireStaff() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const u = session.user as any;
  if (u.role === "CLIENT") throw new Error("Not allowed");
  if (!u.companyId) throw new Error("Your account isn't linked to a company yet - ask an Admin to check your account on the Team page.");
  return { id: u.id as string, email: u.email as string, companyId: u.companyId as string, role: u.role as string };
}
const mayRemove = (role: string) => role === "ADMIN" || role === "MANAGER";

export async function saveClientContact(_prev: { error?: string; saved?: boolean } | undefined, formData: FormData): Promise<{ error?: string; saved?: boolean }> {
  try {
    const user = await requireStaff();
    const id = String(formData.get("clientId") || "").trim() || null;
    const cleaned = cleanClientInput({ name: formData.get("name"), address: formData.get("address"), email: formData.get("email"), phone: formData.get("phone") });
    if (!cleaned.ok) return { error: cleaned.error };
    const r = await saveClient(prisma as unknown as ClientDb, user.companyId, id, cleaned.value);
    if (!r.ok) return { error: r.error };
    await logAuditEvent({ companyId: user.companyId, userId: user.id, userEmail: user.email, action: id ? "client.updated" : "client.created", entityType: "ClientContact", entityId: String(r.client.id), description: `${id ? "Updated" : "Added"} client ${cleaned.value.name}${r.propertiesUpdated > 0 ? ` (${r.propertiesUpdated} propert${r.propertiesUpdated === 1 ? "y" : "ies"} follow it)` : ""}` });
    revalidatePath("/dashboard/settings/clients");
    if (r.propertiesUpdated > 0) revalidatePath("/dashboard/properties");
    return { saved: true };
  } catch (err) {
    if (isRedirectThrow(err)) throw err;
    return { error: err instanceof Error ? err.message : "Couldn't save this client - please try again." };
  }
}

export async function deleteClientContact(formData: FormData): Promise<void> {
  const user = await requireStaff();
  if (!mayRemove(user.role)) return;
  const id = String(formData.get("clientId") || "").trim();
  if (!id) return;
  const r = await deleteClient(prisma as unknown as ClientDb, user.companyId, id);
  if (r.ok) {
    await logAuditEvent({ companyId: user.companyId, userId: user.id, userEmail: user.email, action: "client.deleted", entityType: "ClientContact", entityId: id, description: "Deleted a saved client" });
    revalidatePath("/dashboard/settings/clients");
    revalidatePath("/dashboard/properties");
  }
}

export async function forgetRememberedAddress(formData: FormData): Promise<void> {
  const user = await requireStaff();
  if (!mayRemove(user.role)) return;
  const id = String(formData.get("recipientId") || "").trim();
  if (!id) return;
  await forgetRecipient(prisma as unknown as SuggestDb, user.companyId, id);
  revalidatePath("/dashboard/settings/clients");
}
