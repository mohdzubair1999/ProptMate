import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import FloorPlanEditor from "./floor-plan-editor";

export default async function FloorPlanPage({ params }: { params: Promise<{ propertyId: string }> }) {
  const { propertyId } = await params;

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      floorPlan: {
        include: {
          levels: {
            orderBy: { order: "asc" },
            include: { rooms: { orderBy: { order: "asc" } } },
          },
        },
      },
    },
  });

  if (!property) notFound();

  const initialLevels = (property.floorPlan?.levels || []).map((lvl) => ({
    name: lvl.name,
    rooms: lvl.rooms.map((r) => {
      const shape = (r.shape as "rectangle" | "bay-window" | "l-shape") || "rectangle";
      let params: Record<string, number | string> = {};
      if (r.shapeParams) {
        try {
          params = JSON.parse(r.shapeParams);
        } catch {
          // Malformed JSON shouldn't be possible given saveFloorPlan always writes valid
          // JSON or null, but if it ever happens, falling back to a plain rectangle is far
          // safer than crashing the whole page over one room's shape data.
        }
      }
      let connectedTo: string[] | undefined;
      if (r.connectedRoomNames) {
        try {
          const parsed = JSON.parse(r.connectedRoomNames);
          if (Array.isArray(parsed)) connectedTo = parsed;
        } catch {
          // Same reasoning as the shapeParams fallback above — malformed JSON here just
          // means this room's connections are silently dropped rather than crashing the page.
        }
      }
      let flippedSwingConnections: string[] | undefined;
      if (r.flippedSwingConnections) {
        try {
          const parsed = JSON.parse(r.flippedSwingConnections);
          if (Array.isArray(parsed)) flippedSwingConnections = parsed;
        } catch {}
      }
      let flippedHingeConnections: string[] | undefined;
      if (r.flippedHingeConnections) {
        try {
          const parsed = JSON.parse(r.flippedHingeConnections);
          if (Array.isArray(parsed)) flippedHingeConnections = parsed;
        } catch {}
      }
      let fixturePositions: { type: string; xM: number; yM: number; rotated?: boolean; mirrored?: boolean }[] | undefined;
      if (r.fixturePositions) {
        try {
          const parsed = JSON.parse(r.fixturePositions);
          if (Array.isArray(parsed)) fixturePositions = parsed;
        } catch {}
      }
      let enabledFixtures: string[] | undefined;
      if (r.enabledFixtures) {
        try {
          const parsed = JSON.parse(r.enabledFixtures);
          if (Array.isArray(parsed)) enabledFixtures = parsed;
        } catch {}
      }
      let exteriorDoors: { type?: "main" | "rear"; label?: string; wall: "top" | "bottom" | "left" | "right"; positionM: number; swingFlipped?: boolean }[] | undefined;
      if (r.exteriorDoors) {
        try {
          const parsed = JSON.parse(r.exteriorDoors);
          if (Array.isArray(parsed)) exteriorDoors = parsed;
        } catch {}
      }
      let windows: { wall: "top" | "bottom" | "left" | "right"; positionM: number }[] | undefined;
      if (r.windows) {
        try {
          const parsed = JSON.parse(r.windows);
          if (Array.isArray(parsed)) windows = parsed;
        } catch {}
      }
      let manualRoomTypes: ("bathroom" | "kitchen" | "bedroom" | "livingroom")[] | undefined;
      if (r.manualRoomTypes) {
        try {
          const parsed = JSON.parse(r.manualRoomTypes);
          if (Array.isArray(parsed)) manualRoomTypes = parsed;
        } catch {}
      }
      return {
        name: r.name,
        widthM: String(r.widthM),
        lengthM: String(r.lengthM),
        xM: r.xM ?? undefined,
        yM: r.yM ?? undefined,
        shape,
        bayWidthM:
          params.bayWidthM !== undefined
            ? String(params.bayWidthM)
            : r.bayWindowWidthM !== null && r.bayWindowWidthM !== undefined
            ? String(r.bayWindowWidthM)
            : undefined,
        bayDepthM:
          params.bayDepthM !== undefined
            ? String(params.bayDepthM)
            : r.bayWindowDepthM !== null && r.bayWindowDepthM !== undefined
            ? String(r.bayWindowDepthM)
            : undefined,
        hasBayWindow: !!r.hasBayWindow,
        notchWidthM: params.notchWidthM !== undefined ? String(params.notchWidthM) : undefined,
        notchDepthM: params.notchDepthM !== undefined ? String(params.notchDepthM) : undefined,
        notchCorner: ["top-left", "top-right", "bottom-left", "bottom-right"].includes(String(params.notchCorner))
          ? (params.notchCorner as "top-left" | "top-right" | "bottom-left" | "bottom-right")
          : undefined,
        angledCutWidthM: params.angledCutWidthM !== undefined ? String(params.angledCutWidthM) : undefined,
        angledCutDepthM: params.angledCutDepthM !== undefined ? String(params.angledCutDepthM) : undefined,
        angledCorner: ["top-left", "top-right", "bottom-left", "bottom-right"].includes(String(params.angledCorner))
          ? (params.angledCorner as "top-left" | "top-right" | "bottom-left" | "bottom-right")
          : undefined,
        trapezoidTopWidthM: params.trapezoidTopWidthM !== undefined ? String(params.trapezoidTopWidthM) : undefined,
        trapezoidSide: ["left", "right", "both"].includes(String(params.trapezoidSide)) ? (params.trapezoidSide as "left" | "right" | "both") : undefined,
        slopedTopAmountM: params.slopedTopAmountM !== undefined ? String(params.slopedTopAmountM) : undefined,
        slopedTopSide: ["left", "right"].includes(String(params.slopedTopSide)) ? (params.slopedTopSide as "left" | "right") : undefined,
        rotationDeg: r.rotationDeg !== null && r.rotationDeg !== undefined ? String(r.rotationDeg) : undefined,
        connectedTo,
        flippedSwingConnections,
        flippedHingeConnections,
        isStairs: r.isStairs,
        stairDirection: (r.stairDirection as "up" | "down" | null) ?? undefined,
        stairLinkFloor: r.stairLinkFloor ?? undefined,
        stairLinkRoom: r.stairLinkRoom ?? undefined,
        fixturePositions,
        enabledFixtures,
        isGarden: r.isGarden,
        exteriorDoors,
        windows,
        manualRoomTypes,
      };
    }),
  }));

  return (
    <main>
      <Link href="/dashboard/floor-plans" className="text-sm text-slate hover:text-ink">
        ← Back to Floor Plans
      </Link>

      <h1 className="font-display font-700 text-2xl text-ink mt-4">Floor plan</h1>
      <p className="text-sm text-slate mt-1">{property.address}</p>

      <FloorPlanEditor propertyId={property.id} initialLevels={initialLevels} />
    </main>
  );
}
