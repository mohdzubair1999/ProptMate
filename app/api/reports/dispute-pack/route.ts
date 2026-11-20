import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { findMatchingCheckInInspection } from "@/lib/findMatchingCheckIn";
import { fetchAndResizeImage } from "@/lib/fetchAndResizeImage";
import { buildDisputePack, buildRoomPack, isBelowGood, parseRoomSummaries, type PackItem } from "@/lib/disputePack";
import { DisputePackDocument } from "@/lib/pdf/DisputePackDocument";
import { DisputePackRoomsDocument } from "@/lib/pdf/DisputePackRoomsDocument";

export const maxDuration = 60;
const MAX_IMAGES = 80; // photographs shown in one pack (two per side per changed item), to keep the file and the time reasonable
const PER_SIDE = 2;

const ITEM_SELECT = {
  id: true, room: true, itemName: true, condition: true, cleanliness: true, make: true, quantity: true, notes: true,
  disputeRiskClassification: true, disputeRiskReasoning: true, disputeRiskConfidence: true, disputeRiskEvidenceNote: true,
  photos: { select: { url: true }, orderBy: { timestamp: "asc" as const }, take: 3 },
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "property";

const pdfResponse = (buffer: Buffer, address: string) =>
  new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="deposit-dispute-pack-${slug(address)}.pdf"`, "Cache-Control": "no-store" },
  });
// photographs loaded safely (never from the browser, sized down, eight at a time); any that cannot be loaded are simply left out
async function loadImages(urls: string[]): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  for (let i = 0; i < urls.length; i += 8) {
    const batch = urls.slice(i, i + 8);
    const got = await Promise.allSettled(batch.map((u) => fetchAndResizeImage(u, 700)));
    got.forEach((g, k) => {
      if (g.status === "fulfilled") images[batch[k]] = `data:${g.value.mediaType};base64,${g.value.base64}`;
    });
  }
  return images;
}

// A deposit dispute pack: a completed check-out set against its check-in, item by item, with photographs. It is built only from what
// the two inspections recorded. Everything is read from the database (nothing comes from the browser but the inspection id), both
// inspections must belong to the signed-in person's company, and a check-in that was imported from a document (no items to compare)
// is not compared item by item (that would wrongly show every item as "added"): if it kept room summaries, a room-by-room pack is made
// with a plain warning that those summaries were read from another company's document; if it kept none, it is refused with the reason.
export async function GET(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });

  const inspectionId = new URL(req.url).searchParams.get("inspectionId") ?? "";
  if (!inspectionId || inspectionId.length > 60) return NextResponse.json({ error: "Missing details" }, { status: 400 });

  const limit = await checkRateLimit(`dispute-pack:${session.user.id}`, 10, 15);
  if (!limit.allowed) return NextResponse.json({ error: "That's a lot of packs in a short time - please wait a few minutes and try again." }, { status: 429 });

  const out = await prisma.inspection.findFirst({
    where: { id: inspectionId, deletedAt: null, property: { companyId } },
    select: { id: true, type: true, status: true, propertyId: true, comparedToInspectionId: true, completedDate: true, createdAt: true, property: { select: { address: true } }, items: { select: ITEM_SELECT, orderBy: { id: "asc" } } },
  });
  if (!out) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (out.type !== "check-out") return NextResponse.json({ error: "A deposit dispute pack is made from a check-out." }, { status: 400 });

  const match = await findMatchingCheckInInspection({ propertyId: out.propertyId, comparedToInspectionId: out.comparedToInspectionId, completedDate: out.completedDate }, companyId);
  if (!match) return NextResponse.json({ error: "There is no check-in for this property to compare with." }, { status: 400 });
  const inn = await prisma.inspection.findFirst({
    where: { id: match.id, deletedAt: null, property: { companyId } },
    select: { id: true, completedDate: true, createdAt: true, sourceDocumentUrl: true, importedRoomSummaries: true, items: { select: ITEM_SELECT, orderBy: { id: "asc" } } },
  });
  if (!inn) return NextResponse.json({ error: "There is no check-in for this property to compare with." }, { status: 400 });
  const imported = !!inn.sourceDocumentUrl;
  if (!imported && inn.items.length === 0) {
    return NextResponse.json({ error: "The check-in has no items recorded, so there is nothing to compare item by item." }, { status: 400 });
  }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, website: true } });

  if (imported) {
    // a check-in uploaded from another company's report: room summaries only, no items, and its own date is just the upload day
    const summaries = parseRoomSummaries(inn.importedRoomSummaries);
    if (summaries.length === 0) {
      return NextResponse.json({ error: "The check-in was imported from a document, but no room summaries were read from it, so there is nothing to compare. Compare against the check-in report itself." }, { status: 400 });
    }
    if (out.items.length === 0) {
      return NextResponse.json({ error: "This check-out has no items recorded yet, so there is nothing to set against the check-in report." }, { status: 400 });
    }
    const roomModel = buildRoomPack(summaries, { items: out.items as PackItem[] });
    const wantedRooms: string[] = [];
    for (const r of roomModel.rooms) for (const it of r.items) if (isBelowGood(it.condition)) for (const ph of it.photos.slice(0, PER_SIDE)) if (!wantedRooms.includes(ph.url) && wantedRooms.length < MAX_IMAGES) wantedRooms.push(ph.url);
    const roomImages = await loadImages(wantedRooms);
    try {
      const buffer = await renderToBuffer(React.createElement(DisputePackRoomsDocument, { model: roomModel, images: roomImages, address: out.property.address, checkOutDate: out.completedDate ?? out.createdAt, sourceDocumentUrl: inn.sourceDocumentUrl as string, companyName: company?.name ?? null, companyWebsite: company?.website ?? null, generatedAt: new Date() }) as any);
      return pdfResponse(buffer, out.property.address);
    } catch (err) {
      console.error("Deposit dispute pack (rooms) failed:", err);
      return NextResponse.json({ error: "The pack could not be made. Please try again." }, { status: 500 });
    }
  }

  const model = buildDisputePack({ date: inn.completedDate ?? inn.createdAt, items: inn.items as PackItem[] }, { date: out.completedDate ?? out.createdAt, items: out.items as PackItem[] });

  // photographs for the items that changed: the first two on each side, loaded safely (never from the browser, sized down, and any
  // that cannot be loaded are simply left out and said so on the page)
  const wanted: string[] = [];
  for (const r of model.rows) {
    if (r.status === "unchanged") continue;
    for (const side of [r.checkIn, r.checkOut]) for (const p of (side?.photos ?? []).slice(0, PER_SIDE)) if (!wanted.includes(p.url) && wanted.length < MAX_IMAGES) wanted.push(p.url);
  }
  const images = await loadImages(wanted);
  try {
    const buffer = await renderToBuffer(React.createElement(DisputePackDocument, { model, images, address: out.property.address, companyName: company?.name ?? null, companyWebsite: company?.website ?? null, generatedAt: new Date() }) as any);
    return pdfResponse(buffer, out.property.address);
  } catch (err) {
    console.error("Deposit dispute pack failed:", err);
    return NextResponse.json({ error: "The pack could not be made. Please try again." }, { status: 500 });
  }
}
