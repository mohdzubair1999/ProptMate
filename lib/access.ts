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
