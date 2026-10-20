"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { normaliseSuggestions } from "@/lib/ai/identifyItems";

function isRedirectThrow(err: unknown): boolean {
  return !!err && typeof err === "object" && "digest" in err && typeof (err as any).digest === "string" && (err as any).digest.startsWith("NEXT_REDIRECT");
}

// Adds the items a person ticked from the AI's suggestions to a room's list. Nothing about the
// request is trusted: the inspection must belong to the caller's company and still be a draft, the
// room's field must belong to that inspection's template, the room name comes from the database
// rather than the request, and every item is cleaned again the same way the AI's output was -
// so a tampered request can't add anything the AI couldn't have suggested. Names already on the
// room's list are skipped, so a double-click can't add everything twice.
export async function addSuggestedItems(input: { inspectionId: string; templateFieldId: string; items: unknown }): Promise<{ added?: number; error?: string }> {
  try {
    const session = await getSession();
    if (!session?.user) redirect("/login");
    const companyId = (session.user as any).companyId as string | null;
    if (!companyId) return { error: "Your account isn't linked to a company yet." };

    const inspectionId = String(input?.inspectionId || "");
    const templateFieldId = String(input?.templateFieldId || "");
    if (!inspectionId || !templateFieldId) return { error: "Something went wrong - please refresh the page and try again." };

    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, deletedAt: null, property: { companyId } },
      select: { id: true, status: true, templateId: true },
    });
    if (!inspection) return { error: "Inspection not found." };
    if (inspection.status !== "draft") return { error: "This inspection is already completed, so items can't be added." };

    const field = await prisma.templateField.findFirst({
      where: { id: templateFieldId, type: "INVENTORY_SECTION", section: { templateId: inspection.templateId ?? "none" } },
      select: { label: true },
    });
    if (!field) return { error: "That room wasn't found on this inspection." };

    const already = await prisma.inspectionItem.findMany({ where: { inspectionId, templateFieldId }, select: { itemName: true } });
    const items = normaliseSuggestions({ items: input.items }, already.map((i: { itemName: string }) => i.itemName));
    if (items.length === 0) return { error: "There's nothing new to add." };

    await prisma.inspectionItem.createMany({
      data: items.map((i) => ({
        inspectionId,
        room: field.label,
        itemName: i.name,
        condition: i.condition,
        make: i.make,
        quantity: i.quantity,
        notes: i.note,
        cleanliness: null,
        templateFieldId,
      })),
    });

    revalidatePath(`/dashboard/inspections/${inspectionId}`);
    return { added: items.length };
  } catch (err) {
    if (isRedirectThrow(err)) throw err;
    return { error: err instanceof Error ? err.message : "Couldn't add the items - please try again." };
  }
}
