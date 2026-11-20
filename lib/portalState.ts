// How the tenant portal groups an inspection assigned to a tenant.
//   "pending"   a form waiting for the tenant to fill in (a draft that was never completed)
//   "completed" submitted
//   "updating"  completed once, then re-opened by the agent to be edited: the tenant keeps seeing their submitted copy (read-only), not a new form to fill in
export type PortalState = "pending" | "completed" | "updating";

export function portalState(i: { status: string; firstCompletedDate?: Date | string | null }): PortalState {
  if (i.status === "completed") return "completed";
  return i.firstCompletedDate ? "updating" : "pending";
}

export function portalStateLabel(s: PortalState): string {
  return s === "updating" ? "Being updated by your agent" : s === "completed" ? "Completed" : "To complete";
}
