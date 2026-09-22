import { prisma } from "@/lib/prisma";

export type MatchedCheckIn = { id: string; completedDate: Date | null };

// Finds the check-in inspection for the same property as the given later-stage inspection.
// Prefers whatever inspection staff have already explicitly linked via the existing
// "Comparing against..." feature - but only if that link genuinely points to a check-in; if
// it points to something else (e.g. a prior mid-term), falls through to searching for the
// actual most recent check-in instead, since that's specifically what callers of this need.
export async function findMatchingCheckInInspection(
  currentInspection: { propertyId: string; comparedToInspectionId: string | null; completedDate: Date | null },
  companyId: string | null
): Promise<MatchedCheckIn | null> {
  if (currentInspection.comparedToInspectionId) {
    const compared = await prisma.inspection.findFirst({
      where: { id: currentInspection.comparedToInspectionId, type: "check-in", property: { companyId: companyId || undefined } },
      select: { id: true, completedDate: true },
    });
    if (compared) return compared;
  }

  // Most recent check-in for the same property, completed before this inspection's own
  // completion date (or now, if it isn't marked complete yet) - a plain "most recent check-in
  // overall" could otherwise wrongly match a later, unrelated tenancy's check-in if
  // inspections were ever completed out of chronological order.
  const cutoff = currentInspection.completedDate || new Date();
  return prisma.inspection.findFirst({
    where: {
      propertyId: currentInspection.propertyId,
      type: "check-in",
      status: "completed",
      completedDate: { lte: cutoff },
      deletedAt: null,
      property: { companyId: companyId || undefined },
    },
    orderBy: { completedDate: "desc" },
    select: { id: true, completedDate: true },
  });
}

// Exact, trimmed, case-insensitive match on room + item name only - deliberately never
// fuzzy. A wrong match (silently comparing against a different item) is worse than finding
// no match at all, since a wrong comparison could put false context in front of whoever's
// reading it without them realising it.
export async function findMatchingCheckInItem(checkInInspectionId: string, matchRoom: string, matchLabel: string) {
  return prisma.inspectionItem.findFirst({
    where: { inspectionId: checkInInspectionId, room: { equals: matchRoom, mode: "insensitive" }, itemName: { equals: matchLabel, mode: "insensitive" } },
    select: { condition: true, cleanliness: true, notes: true, photos: { select: { url: true } } },
  });
}
