import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const companyId = (session.user as any).companyId as string | null;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const itemId = String(formData.get("itemId") || "");
  const fieldId = String(formData.get("fieldId") || "");
  const inspectionId = String(formData.get("inspectionId") || "");

  if (!file || (!itemId && !(fieldId && inspectionId))) {
    return NextResponse.json({ error: "Missing file or target id" }, { status: 400 });
  }

  let photo;

  if (itemId) {
    const item = await prisma.inspectionItem.findFirst({
      where: { id: itemId, inspection: { property: { companyId: companyId || undefined } } },
    });
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    const blob = await put(`inspection-photos/${itemId}-${Date.now()}-${file.name}`, file, { access: "public" });
    photo = await prisma.photo.create({ data: { inspectionItemId: itemId, url: blob.url } });
  } else {
    const inspection = await prisma.inspection.findFirst({
      where: { id: inspectionId, property: { companyId: companyId || undefined } },
    });
    if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

    const answer = await prisma.fieldAnswer.upsert({
      where: { inspectionId_fieldId: { inspectionId, fieldId } },
      update: {},
      create: { inspectionId, fieldId },
    });

    const blob = await put(`field-photos/${answer.id}-${Date.now()}-${file.name}`, file, { access: "public" });
    photo = await prisma.photo.create({ data: { fieldAnswerId: answer.id, url: blob.url } });
  }

  return NextResponse.json(photo, { status: 201 });
}
