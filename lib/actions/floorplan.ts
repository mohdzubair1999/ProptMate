"use server";

import { getSession } from "@/lib/session";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

async function requireUser() {
  const session = await getSession();
  if (!session?.user) redirect("/login");
  return {
    id: session.user.id,
    email: session.user.email,
    companyId: (session.user as any).companyId as string | null,
  };
}

type RoomInput = {
  name: string;
  widthM: number;
  lengthM: number;
  xM?: number;
  yM?: number;
  shape?: string;
  shapeParams?: string;
  hasBayWindow?: boolean;
  bayWindowWidthM?: number;
  bayWindowDepthM?: number;
  rotationDeg?: number;
  connectedRoomNames?: string[];
  flippedSwingConnections?: string[];
  flippedHingeConnections?: string[];
  isStairs?: boolean;
  stairDirection?: string;
  stairLinkFloor?: string;
  stairLinkRoom?: string;
  fixturePositions?: { type: string; xM: number; yM: number; rotated?: boolean; mirrored?: boolean }[];
  enabledFixtures?: string[];
  isGarden?: boolean;
  exteriorDoors?: { type?: "main" | "rear"; label?: string; wall: "top" | "bottom" | "left" | "right"; positionM: number; swingFlipped?: boolean }[];
  windows?: { wall: "top" | "bottom" | "left" | "right"; positionM: number }[];
  manualRoomTypes?: ("bathroom" | "kitchen" | "bedroom" | "livingroom")[];
};
type LevelInput = { name: string; rooms: RoomInput[] };

// Basic sanity limits on the extra shape dimensions — a bay or notch that's as big as (or
// bigger than) the room itself isn't a genuine bay/notch anymore, it's a differently-shaped
// room the bounding box math wasn't built for. Rather than silently producing a broken
// shape, fall back to a plain rectangle when the numbers don't make sense.
// Validates the separate, independently-combinable bay window add-on (see hasBayWindow's own
// comment on the Room type in the editor for the full reasoning) - same dimension/proportion
// checks as validateShape's own "bay-window" case above, since it's geometrically the same
// bay either way, just combined with a different primary shape instead of being the room's
// only shape. Never valid when shape is already "bay-window" itself, since that case is
// already fully handled by validateShape and a second bay on the same room wouldn't mean
// anything.
function validateBayWindowAddon(
  shape: string,
  hasBayWindow: boolean | undefined,
  bayWindowWidthM: number | undefined,
  bayWindowDepthM: number | undefined,
  widthM: number,
  lengthM: number
): { hasBayWindow: boolean; bayWindowWidthM: number | null; bayWindowDepthM: number | null } {
  if (
    shape !== "bay-window" &&
    hasBayWindow &&
    typeof bayWindowWidthM === "number" &&
    typeof bayWindowDepthM === "number" &&
    bayWindowWidthM > 0 &&
    bayWindowWidthM < widthM &&
    bayWindowDepthM > 0 &&
    bayWindowDepthM < lengthM &&
    bayWindowWidthM > bayWindowDepthM * 2
  ) {
    return { hasBayWindow: true, bayWindowWidthM, bayWindowDepthM };
  }
  return { hasBayWindow: false, bayWindowWidthM: null, bayWindowDepthM: null };
}

function validateShape(shape: string | undefined, shapeParams: string | undefined, widthM: number, lengthM: number): { shape: string; shapeParams: string | null } {
  if (shape === "bay-window" && shapeParams) {
    try {
      const p = JSON.parse(shapeParams);
      if (typeof p.bayWidthM === "number" && typeof p.bayDepthM === "number" && p.bayWidthM > 0 && p.bayWidthM < widthM && p.bayDepthM > 0 && p.bayDepthM < lengthM && p.bayWidthM > p.bayDepthM * 2) {
        return { shape: "bay-window", shapeParams: JSON.stringify({ bayWidthM: p.bayWidthM, bayDepthM: p.bayDepthM }) };
      }
    } catch {}
  }
  if (shape === "l-shape" && shapeParams) {
    try {
      const p = JSON.parse(shapeParams);
      if (typeof p.notchWidthM === "number" && typeof p.notchDepthM === "number" && p.notchWidthM > 0 && p.notchWidthM < widthM && p.notchDepthM > 0 && p.notchDepthM < lengthM) {
        const validCorners = ["top-left", "top-right", "bottom-left", "bottom-right"];
        const notchCorner = validCorners.includes(p.notchCorner) ? p.notchCorner : "bottom-right";
        return { shape: "l-shape", shapeParams: JSON.stringify({ notchWidthM: p.notchWidthM, notchDepthM: p.notchDepthM, notchCorner }) };
      }
    } catch {}
  }
  if (shape === "angled-corner" && shapeParams) {
    try {
      const p = JSON.parse(shapeParams);
      if (
        typeof p.angledCutWidthM === "number" &&
        typeof p.angledCutDepthM === "number" &&
        p.angledCutWidthM > 0 &&
        p.angledCutWidthM < widthM &&
        p.angledCutDepthM > 0 &&
        p.angledCutDepthM < lengthM
      ) {
        const validCorners = ["top-left", "top-right", "bottom-left", "bottom-right"];
        const angledCorner = validCorners.includes(p.angledCorner) ? p.angledCorner : "bottom-right";
        return { shape: "angled-corner", shapeParams: JSON.stringify({ angledCutWidthM: p.angledCutWidthM, angledCutDepthM: p.angledCutDepthM, angledCorner }) };
      }
    } catch {}
  }
  if (shape === "trapezoid" && shapeParams) {
    try {
      const p = JSON.parse(shapeParams);
      if (typeof p.trapezoidTopWidthM === "number" && p.trapezoidTopWidthM > 0 && p.trapezoidTopWidthM < widthM) {
        const validSides = ["left", "right", "both"];
        const trapezoidSide = validSides.includes(p.trapezoidSide) ? p.trapezoidSide : "both";
        return { shape: "trapezoid", shapeParams: JSON.stringify({ trapezoidTopWidthM: p.trapezoidTopWidthM, trapezoidSide }) };
      }
    } catch {}
  }
  if (shape === "sloped-top" && shapeParams) {
    try {
      const p = JSON.parse(shapeParams);
      if (typeof p.slopedTopAmountM === "number" && p.slopedTopAmountM > 0 && p.slopedTopAmountM < lengthM) {
        const validSides = ["left", "right"];
        const slopedTopSide = validSides.includes(p.slopedTopSide) ? p.slopedTopSide : "left";
        return { shape: "sloped-top", shapeParams: JSON.stringify({ slopedTopAmountM: p.slopedTopAmountM, slopedTopSide }) };
      }
    } catch {}
  }
  return { shape: "rectangle", shapeParams: null };
}

// Replaces the property's entire floor plan (every level and room) in one go, rather than
// diffing individual records — simpler and safer given rooms don't have any other data
// (photos, conditions) attached to them that would need preserving across an edit.
export async function saveFloorPlan(propertyId: string, levels: LevelInput[]) {
  const user = await requireUser();

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId || undefined } });
  if (!property) throw new Error("Property not found");

  const validLevels = levels
    .map((l) => ({
      name: l.name.trim() || "Ground floor",
      // 30m is a genuine ceiling, not just an HTML input hint — comfortably covers any
      // realistic room while rejecting an accidental typo like "500" instead of "5.0" that
      // would otherwise break the layout.
      rooms: l.rooms.filter((r) => r.name.trim() && r.widthM > 0 && r.widthM <= 30 && r.lengthM > 0 && r.lengthM <= 30),
    }))
    .filter((l) => l.rooms.length > 0);

  if (validLevels.length === 0) throw new Error("Add at least one room with a name and valid dimensions");

  // Built once, before any level is created, since a stair link can point at a floor that
  // hasn't been processed yet in the loop below. Only includes rooms that will genuinely end
  // up marked as stairs after shape validation (isStairs requires shape === "rectangle"), not
  // just rooms that claimed to be stairs before that check runs.
  const stairsRoomsByFloor = new Map<string, Set<string>>();
  for (const level of validLevels) {
    const floorName = level.name.trim() || "Ground floor";
    const stairNames = new Set<string>();
    for (const r of level.rooms) {
      const validated = validateShape(r.shape, r.shapeParams, r.widthM, r.lengthM);
      if (r.isStairs && validated.shape === "rectangle") stairNames.add(r.name.trim());
    }
    stairsRoomsByFloor.set(floorName, stairNames);
  }

  await prisma.$transaction(async (tx) => {
    const floorPlan = await tx.floorPlan.upsert({
      where: { propertyId },
      create: { propertyId },
      update: { updatedAt: new Date() },
    });

    // Deleting the FloorPlanLevel rows cascades to their rooms automatically (onDelete:
    // Cascade), so this alone is enough to clear out the previous plan entirely.
    await tx.floorPlanLevel.deleteMany({ where: { floorPlanId: floorPlan.id } });

    for (let li = 0; li < validLevels.length; li++) {
      const level = await tx.floorPlanLevel.create({
        data: { floorPlanId: floorPlan.id, name: validLevels[li].name, order: li },
      });

      // Only keep connections that reference another room actually present on this same
      // floor — a name pointing at a room that was deleted, renamed, or belongs to a
      // different floor shouldn't be silently carried forward as a dangling reference.
      const validNamesOnThisFloor = new Set(validLevels[li].rooms.map((r) => r.name.trim()));

      await tx.floorPlanRoom.createMany({
        data: validLevels[li].rooms.map((r, ri) => {
          const validated = validateShape(r.shape, r.shapeParams, r.widthM, r.lengthM);
          const bayAddon = validateBayWindowAddon(validated.shape, r.hasBayWindow, r.bayWindowWidthM, r.bayWindowDepthM, r.widthM, r.lengthM);
          const validConnections = (r.connectedRoomNames || []).filter((n) => n !== r.name.trim() && validNamesOnThisFloor.has(n));
          // Only meaningful for a room that's actually still connected — a flip pointing at
          // a room that's no longer in validConnections would be a dangling override with
          // nothing left for it to override.
          const validSwingFlips = (r.flippedSwingConnections || []).filter((n) => validConnections.includes(n));
          const validHingeFlips = (r.flippedHingeConnections || []).filter((n) => validConnections.includes(n));
          const validDirection = r.stairDirection === "up" || r.stairDirection === "down" ? r.stairDirection : null;
          const effectiveIsStairs = !!r.isStairs && validated.shape === "rectangle";

          // A stair link only makes sense pointing at a room that's genuinely a staircase
          // itself, on a different floor (linking to a room on this same floor, or to
          // itself, isn't a cross-floor connection at all).
          let stairLinkFloor: string | null = null;
          let stairLinkRoom: string | null = null;
          if (effectiveIsStairs && r.stairLinkFloor && r.stairLinkRoom) {
            const targetFloor = r.stairLinkFloor.trim();
            const targetRoom = r.stairLinkRoom.trim();
            const targetFloorStairs = stairsRoomsByFloor.get(targetFloor);
            if (targetFloor !== validLevels[li].name && targetFloorStairs?.has(targetRoom)) {
              stairLinkFloor = targetFloor;
              stairLinkRoom = targetRoom;
            }
          }

          const validFixturePositions = (r.fixturePositions || []).filter(
            (f) => typeof f?.type === "string" && f.type.trim() && typeof f.xM === "number" && f.xM >= 0 && f.xM <= 30 && typeof f.yM === "number" && f.yM >= 0 && f.yM <= 30
          );

          const KNOWN_FIXTURE_TYPES = ["bath", "shower", "toilet", "basin", "sink", "hob", "bed", "wardrobe", "sofa", "coffee-table"];
          const validEnabledFixtures = Array.isArray(r.enabledFixtures) ? r.enabledFixtures.filter((t) => KNOWN_FIXTURE_TYPES.includes(t)) : undefined;

          const validExteriorDoors = (r.exteriorDoors || [])
            .filter(
              (d) =>
                (typeof d?.label === "string" || d?.type === "main" || d?.type === "rear") &&
                ["top", "bottom", "left", "right"].includes(d?.wall) &&
                typeof d.positionM === "number" &&
                d.positionM >= 0 &&
                d.positionM <= 30
            )
            .map((d) => ({
              wall: d.wall,
              positionM: d.positionM,
              ...(typeof d.label === "string" && d.label.trim() ? { label: d.label.trim().slice(0, 60) } : {}),
              ...(d.type === "main" || d.type === "rear" ? { type: d.type } : {}),
              ...(d.swingFlipped ? { swingFlipped: true } : {}),
            }))
            .slice(0, 10);

          const validWindows = (r.windows || [])
            .filter((w) => ["top", "bottom", "left", "right"].includes(w?.wall) && typeof w.positionM === "number" && w.positionM >= 0 && w.positionM <= 30)
            .slice(0, 20);

          const KNOWN_ROOM_TYPES = ["bathroom", "kitchen", "bedroom", "livingroom"];
          const validManualRoomTypes = Array.isArray(r.manualRoomTypes) ? r.manualRoomTypes.filter((t) => KNOWN_ROOM_TYPES.includes(t)) : undefined;

          return {
            levelId: level.id,
            name: r.name.trim(),
            widthM: r.widthM,
            lengthM: r.lengthM,
            order: ri,
            xM: r.xM ?? null,
            yM: r.yM ?? null,
            shape: validated.shape,
            shapeParams: validated.shapeParams,
            hasBayWindow: bayAddon.hasBayWindow,
            bayWindowWidthM: bayAddon.bayWindowWidthM,
            bayWindowDepthM: bayAddon.bayWindowDepthM,
            rotationDeg: typeof r.rotationDeg === "number" && !isNaN(r.rotationDeg) ? ((r.rotationDeg % 360) + 360) % 360 : null,
            connectedRoomNames: validConnections.length > 0 ? JSON.stringify(validConnections) : null,
            flippedSwingConnections: validSwingFlips.length > 0 ? JSON.stringify(validSwingFlips) : null,
            flippedHingeConnections: validHingeFlips.length > 0 ? JSON.stringify(validHingeFlips) : null,
            isStairs: effectiveIsStairs,
            stairDirection: effectiveIsStairs ? validDirection : null,
            stairLinkFloor,
            stairLinkRoom,
            fixturePositions: validFixturePositions.length > 0 ? JSON.stringify(validFixturePositions) : null,
            enabledFixtures: validEnabledFixtures ? JSON.stringify(validEnabledFixtures) : null,
            isGarden: !!r.isGarden,
            exteriorDoors: validExteriorDoors.length > 0 ? JSON.stringify(validExteriorDoors) : null,
            windows: validWindows.length > 0 ? JSON.stringify(validWindows) : null,
            // Checked for undefined-ness, not length — unlike every other field here, an
            // explicit "[]" (deliberately no fixtures at all) must be preserved distinctly
            // from null (never set, use auto-detection), not collapsed into the same value.
            manualRoomTypes: validManualRoomTypes !== undefined ? JSON.stringify(validManualRoomTypes) : null,
          };
        }),
      });
    }
  });

  revalidatePath(`/dashboard/floor-plans/${propertyId}`);
  revalidatePath("/dashboard/floor-plans");
}

export async function deleteFloorPlan(propertyId: string) {
  const user = await requireUser();

  const property = await prisma.property.findFirst({ where: { id: propertyId, companyId: user.companyId || undefined } });
  if (!property) throw new Error("Property not found");

  await prisma.floorPlan.deleteMany({ where: { propertyId } });

  revalidatePath("/dashboard/floor-plans");
  redirect("/dashboard/floor-plans");
}
