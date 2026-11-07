import { sortJobs, type JobView } from "@/lib/maintenanceTracking";

// The maintenance jobs tracked for a property, as they appear in a MID-TERM inspection's report: what is still outstanding, and what was fixed at
// this inspection. Plain facts (what, where, when first reported, when last confirmed): no advice and no opinions.
export type ReportJob = { urgency: string; timeframe: string; area: string; text: string; status: string; foundDate: Date; lastConfirmed: Date | null; fixedDate: Date | null };
export type ReportJobs = { open: ReportJob[]; fixed: ReportJob[]; openMore: number; fixedMore: number };
export const MAX_OPEN_IN_REPORT = 30;
export const MAX_FIXED_IN_REPORT = 15;
export const URGENCY_WORDS: Record<string, string> = { urgent: "Urgent", "28-days": "Within 28 days", routine: "Routine", monitor: "Monitor" };

const toDate = (iso: string | null | undefined): Date | null => { if (!iso) return null; const d = new Date(iso); return Number.isNaN(+d) ? null : d; };
const line = (j: JobView): ReportJob => ({ urgency: j.urgency, timeframe: j.timeframe, area: j.area, text: j.text, status: j.status, foundDate: toDate(j.createdAt) ?? new Date(0), lastConfirmed: toDate(j.lastSeenAt), fixedDate: toDate(j.resolvedAt) });

// null when there is nothing to show (then the report has no such section at all)
export function buildReportJobs(jobs: JobView[], inspectionId: string): ReportJobs | null {
  const all = Array.isArray(jobs) ? jobs.filter((j) => j && typeof j.status === "string") : [];
  const open = sortJobs(all).filter((j) => j.status !== "done");
  const fixed = all.filter((j) => j.status === "done" && typeof inspectionId === "string" && inspectionId !== "" && j.resolvedInspectionId === inspectionId).sort((a, b) => +(toDate(a.resolvedAt) ?? 0) - +(toDate(b.resolvedAt) ?? 0));
  if (open.length === 0 && fixed.length === 0) return null;
  return { open: open.slice(0, MAX_OPEN_IN_REPORT).map(line), fixed: fixed.slice(0, MAX_FIXED_IN_REPORT).map(line), openMore: Math.max(0, open.length - MAX_OPEN_IN_REPORT), fixedMore: Math.max(0, fixed.length - MAX_FIXED_IN_REPORT) };
}
