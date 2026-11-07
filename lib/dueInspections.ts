import { prisma } from "@/lib/prisma";
import { computeNextInspection } from "@/lib/inspectionScheduling";
import { daysBetweenDates } from "@/lib/inspectionReminders";

// The dashboard's "Inspections due" list: properties that are overdue, never inspected (with a schedule set), or due within a month.
// Only inspections that have not been deleted count: a deleted inspection must not decide when the next one is due.
export type DueRow = { id: string; address: string; kind: "overdue" | "never" | "soon"; daysUntil: number | null; due: Date | null };
type PropertyForDue = { id: string; address: string; inspectionFrequencyMonths: number | null; inspections: { status: string; completedDate: Date | null; scheduledDate: Date | null }[] };

export const DUE_WINDOW_DAYS = 30;
const ORDER = { overdue: 0, never: 1, soon: 2 } as const;

export function buildDueRows(props: PropertyForDue[], today: Date, windowDays = DUE_WINDOW_DAYS): DueRow[] {
  const rows: DueRow[] = [];
  for (const p of Array.isArray(props) ? props : []) {
    if (!p || !Array.isArray(p.inspections)) continue;
    const next = computeNextInspection(p.inspections, p.inspectionFrequencyMonths);
    if (!next) continue;
    if (!next.date) {
      if (next.urgent) rows.push({ id: p.id, address: p.address, kind: "never", daysUntil: null, due: null }); // "In progress" has no date and is not listed
      continue;
    }
    const daysUntil = daysBetweenDates(today, next.date);
    if (daysUntil < 0) rows.push({ id: p.id, address: p.address, kind: "overdue", daysUntil, due: next.date });
    else if (daysUntil <= windowDays) rows.push({ id: p.id, address: p.address, kind: "soon", daysUntil, due: next.date });
  }
  // most overdue first, then never inspected, then the soonest; ties by address so the order is always the same
  return rows.sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.daysUntil ?? 0) - (b.daysUntil ?? 0) || a.address.localeCompare(b.address));
}

export function describeDueRow(r: DueRow): string {
  if (r.kind === "never") return "Never inspected: schedule now";
  const n = r.daysUntil ?? 0;
  if (r.kind === "overdue") return `Overdue by ${-n} day${-n === 1 ? "" : "s"}`;
  return n === 0 ? "Due today" : n === 1 ? "Due tomorrow" : `Due in ${n} days`;
}

export async function loadDueInspections(companyId: string | null | undefined, today: Date = new Date()): Promise<DueRow[]> {
  if (!companyId) return []; // a company-less account must never match every company's properties
  const props = await prisma.property.findMany({
    where: { companyId, inspectionFrequencyMonths: { not: null } },
    select: {
      id: true, address: true, inspectionFrequencyMonths: true,
      // only inspections that have not been deleted; and only the latest, which is all the schedule depends on
      inspections: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, completedDate: true, scheduledDate: true } },
    },
  });
  return buildDueRows(props as PropertyForDue[], today);
}
