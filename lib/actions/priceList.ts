"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { EXAMPLE_PRICES, parseDraft, serialiseDraft } from "@/lib/depositEstimate";

async function requireStaff() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  const u = session.user as any;
  if (u.role === "CLIENT") throw new Error("Not allowed");
  if (!u.companyId) throw new Error("Your account isn't linked to a company yet.");
  return { companyId: u.companyId as string, role: u.role as string };
}
const mayEdit = (role: string) => role === "ADMIN" || role === "MANAGER";

export async function savePriceItem(_prev: { error?: string; saved?: boolean } | undefined, formData: FormData): Promise<{ error?: string; saved?: boolean }> {
  const { companyId, role } = await requireStaff();
  if (!mayEdit(role)) return { error: "Only an Admin or Manager can change the price list." };
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  const keywords = String(formData.get("keywords") || "").trim().slice(0, 300);
  const pounds = Number(String(formData.get("price") || "").replace(/[£,\s]/g, ""));
  const lifeRaw = String(formData.get("lifespan") || "").trim();
  const life = lifeRaw === "" ? null : Number(lifeRaw);
  if (!name) return { error: "Give this price a name." };
  if (!Number.isFinite(pounds) || pounds <= 0 || pounds > 100000) return { error: "Enter a price in pounds, for example 90 or 45.50." };
  if (life !== null && (!Number.isInteger(life) || life < 1 || life > 100)) return { error: "Lifespan is a whole number of years, or leave it empty." };
  const count = await prisma.priceListItem.count({ where: { companyId } });
  if (count >= 200) return { error: "The price list is full (200 lines). Remove some you no longer use." };
  await prisma.priceListItem.create({ data: { companyId, name, keywords, pricePence: Math.round(pounds * 100), lifespanYears: life } });
  revalidatePath("/dashboard/settings/price-list");
  return { saved: true };
}

export async function deletePriceItem(formData: FormData): Promise<void> {
  const { companyId, role } = await requireStaff();
  if (!mayEdit(role)) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.priceListItem.deleteMany({ where: { id, companyId } });
  revalidatePath("/dashboard/settings/price-list");
}

export async function addExamplePrices(): Promise<void> {
  const { companyId, role } = await requireStaff();
  if (!mayEdit(role)) return;
  if ((await prisma.priceListItem.count({ where: { companyId } })) > 0) return;
  await prisma.priceListItem.createMany({ data: EXAMPLE_PRICES.map((e) => ({ companyId, ...e })) });
  revalidatePath("/dashboard/settings/price-list");
}

// Saves the agent's working draft schedule on a check-out. Only the company's own inspection.
export async function saveDepositDraft(inspectionId: string, linesJson: string): Promise<{ ok: boolean; error?: string }> {
  const { companyId } = await requireStaff();
  const lines = parseDraft(linesJson);
  if (!lines) return { ok: false, error: "That draft could not be read." };
  const r = await prisma.inspection.updateMany({ where: { id: inspectionId, deletedAt: null, type: "check-out", property: { companyId } }, data: { depositDraft: serialiseDraft(lines) } });
  if (r.count === 0) return { ok: false, error: "Check-out not found." };
  return { ok: true };
}
