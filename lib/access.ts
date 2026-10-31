// One rule for "which company's records may this person touch": their own, and NOTHING if they have no company.
//
// The trap this exists to remove: Prisma ignores a filter whose value is `undefined`. So `{ companyId: user.companyId ||
// undefined }` quietly becomes "no filter at all" for an account that isn't linked to a company (a half-finished signup,
// or a team member who has since been removed) - and that account would then match EVERY company's records. Writing the
// company filter through scopeCompanyId() instead gives such an account a value that matches nothing.

export const NO_COMPANY = "__no_company__"; // can never equal a real company id (those are generated ids)

export function scopeCompanyId(companyId: string | null | undefined): string {
  return typeof companyId === "string" && companyId.length > 0 ? companyId : NO_COMPANY;
}

// ---- which inspections may this person touch? ------------------------------------------------------------------
//
// Two kinds of account use the inspection form:
//   * Staff (admin, manager, inspector) belong to a company and reach that company's inspections.
//   * Clients (tenants, landlords) belong to NO company. They reach only the inspections ASSIGNED to them, and only
//     while still a draft: once a client has submitted, they can no longer change it.
// Written once here so every action and route applies exactly the same rule. It never returns an `undefined` value,
// because Prisma ignores an undefined filter and would then match everyone's records.
export type AccessUser = { id?: string | null; role?: string | null; companyId?: string | null };

export function inspectionAccess(user: AccessUser) {
  if (user.role === "CLIENT") {
    return { deletedAt: null, assignedClientId: typeof user.id === "string" && user.id.length > 0 ? user.id : NO_COMPANY, status: "draft" } as const;
  }
  return { deletedAt: null, property: { companyId: scopeCompanyId(user.companyId) } } as const;
}

// The same rule for an inspection that has already been loaded (for example the one a photo belongs to).
export function userMayReachInspection(user: AccessUser, inspection: { assignedClientId?: string | null; status?: string | null; property?: { companyId?: string | null } | null }): boolean {
  if (user.role === "CLIENT") return typeof user.id === "string" && user.id.length > 0 && inspection.assignedClientId === user.id && inspection.status === "draft";
  return typeof user.companyId === "string" && user.companyId.length > 0 && inspection.property?.companyId === user.companyId;
}
