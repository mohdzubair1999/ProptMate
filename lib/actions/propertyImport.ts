"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAuditEvent } from "@/lib/auditLog";
import { MAX_ROWS, propertyKey, updateData, validateSheet, type ExistingProperty, type RowResult } from "@/lib/propertyImport";

export type ImportResponse = {
  missingAddress: boolean;
  ignored: string[];
  rows: RowResult[];
  summary: { total: number; ok: number; errors: number; duplicates: number; updates: number };
  created: number | null; // null for a preview (nothing was saved)
  updated: number | null;
};

// Checks (dryRun) or imports a spreadsheet of properties. Everything is checked again HERE, whatever the browser's preview said, the
// company always comes from the signed-in session (never from what was sent), and a property the company already has is skipped.
export async function importProperties(sheet: unknown, dryRun: boolean, updateExisting: boolean = false): Promise<ImportResponse> {
  updateExisting = updateExisting === true; // only a real true turns it on
  const session = await getSession();
  const user = session?.user as { id?: string; email?: string; companyId?: string | null } | undefined;
  if (!user?.id || !user.companyId) throw new Error("Your account isn't linked to a company yet - ask an Admin to check your account on the Team page.");
  const companyId = user.companyId;

  const limit = await checkRateLimit(`property-import:${dryRun ? "preview" : "save"}:${user.id}`, dryRun ? 60 : 10, 15);
  if (!limit.allowed) throw new Error("That's a lot of imports in a short time - please wait a few minutes and try again.");

  // the sheet as text cells: at most the header and 500 rows of 30 columns, every cell cut to a sane length before it is even looked at
  if (!Array.isArray(sheet) || sheet.length === 0) throw new Error("There is nothing to import.");
  const grid = sheet.slice(0, MAX_ROWS + 1).map((r) => (Array.isArray(r) ? r.slice(0, 30).map((c) => (typeof c === "string" || typeof c === "number" ? String(c).slice(0, 5000) : "")) : []));

  const have = await prisma.property.findMany({
    where: { companyId },
    select: { id: true, address: true, postcode: true, city: true, bedrooms: true, type: true, landlordName: true, landlordAddress: true, notes: true, inspectionFrequencyMonths: true },
    orderBy: { createdAt: "asc" },
    take: 50000,
  });
  // the company's own properties by address and postcode (if two share a key, the oldest is the one an update would change)
  const existing = new Map<string, ExistingProperty>();
  for (const p of have as ExistingProperty[]) { const k = propertyKey(p.address, p.postcode); if (!existing.has(k)) existing.set(k, p); }
  const result = validateSheet(grid, existing, { updateExisting });
  const base = { missingAddress: result.missingAddress, ignored: result.ignored, rows: result.rows, summary: result.summary };
  if (dryRun) return { ...base, created: null, updated: null };
  if (result.missingAddress) throw new Error("The first row needs a column called Address.");

  const toCreate = result.rows.filter((r) => r.status === "ok" && r.values).map((r) => ({ companyId, ...r.values! }));
  const toUpdate = updateExisting ? result.rows.filter((r) => r.status === "update" && r.values && r.existingId) : [];
  if (toCreate.length === 0 && toUpdate.length === 0) return { ...base, created: 0, updated: 0 };
  const made = toCreate.length ? await prisma.property.createMany({ data: toCreate }) : { count: 0 };
  // an update changes ONLY the fields that differ, and only a property of THIS company (the company is in the filter, so a crafted id cannot reach another's)
  let updated = 0;
  for (const r of toUpdate) {
    const cur = (have as ExistingProperty[]).find((p) => p.id === r.existingId);
    const data = cur ? updateData(cur, r.values!, !!r.typeGiven) : {};
    if (Object.keys(data).length === 0) continue;
    const res = await prisma.property.updateMany({ where: { id: r.existingId!, companyId }, data });
    updated += res.count;
  }
  const skipped = result.summary.errors + result.summary.duplicates;
  await logAuditEvent({ companyId, userId: user.id, userEmail: user.email ?? "", action: "property.imported", entityType: "Property", entityId: "bulk", description: `Imported ${made.count} propert${made.count === 1 ? "y" : "ies"} from a spreadsheet${updateExisting ? ` and updated ${updated} existing` : ""}${skipped ? ` (${skipped} row${skipped === 1 ? "" : "s"} skipped)` : ""}` });
  revalidatePath("/dashboard/properties");
  return { ...base, created: made.count, updated };
}
