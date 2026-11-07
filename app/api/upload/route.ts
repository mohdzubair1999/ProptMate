import { inspectionAccess } from "@/lib/access";
import { userRateLimit } from "@/lib/aiGuard";
import { readUpload, safeFileName } from "@/lib/uploadGuard";
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  // Generous (a big inventory, or a day of offline photos syncing back, uploads hundreds in minutes) but not unlimited:
  // every stored file costs money. A refused upload stays in the offline queue and is retried later, so nothing is lost.
  const limited = await userRateLimit(session, "upload", { max: 600, windowMin: 15, companyDaily: 10000, clientShare: 1 });
  if (limited) return limited;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const itemId = String(formData.get("itemId") || "");
  const fieldId = String(formData.get("fieldId") || "");
  const inspectionId = String(formData.get("inspectionId") || "");

  if (!file || (!itemId && !(fieldId && inspectionId))) {
    return NextResponse.json({ error: "Missing file or target id" }, { status: 400 });
  }

  let photo;

  try {
    if (itemId) {
      const item = await prisma.inspectionItem.findFirst({
        where: { id: itemId, inspection: inspectionAccess(session.user as any) },
      });
      if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

      const upload = await readUpload(file, { allow: ["image"], maxBytes: 10 * 1024 * 1024 });
      if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: upload.status });
      const blob = await put(`inspection-photos/${itemId}-${Date.now()}-${safeFileName(file.name, upload.type.ext)}`, upload.bytes, { access: "public", contentType: upload.type.mime });
      photo = await prisma.photo.create({ data: { inspectionItemId: itemId, url: blob.url } });
    } else {
      const inspection = await prisma.inspection.findFirst({
        where: { id: inspectionId, ...inspectionAccess(session.user as any) },
      });
      if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

      const upload = await readUpload(file, { allow: ["image"], maxBytes: 10 * 1024 * 1024 });
      if (!upload.ok) return NextResponse.json({ error: upload.error }, { status: upload.status });

      const answer = await prisma.fieldAnswer.upsert({
        where: { inspectionId_fieldId: { inspectionId, fieldId } },
        update: {},
        create: { inspectionId, fieldId },
      });

      const blob = await put(`field-photos/${answer.id}-${Date.now()}-${safeFileName(file.name, upload.type.ext)}`, upload.bytes, { access: "public", contentType: upload.type.mime });
      photo = await prisma.photo.create({ data: { fieldAnswerId: answer.id, url: blob.url } });
    }
  } catch (err: any) {
    // Surfaces the actual failure reason (a Blob quota error, a database issue, whatever it
    // turns out to be) instead of letting it become an unhandled exception that reaches the
    // client as a bare 500 with no detail — every prior failure of this kind showed up to the
    // person as the exact same generic "Upload failed" message regardless of cause.
    return NextResponse.json({ error: err?.message || "Upload failed" }, { status: 500 });
  }

  return NextResponse.json(photo, { status: 201 });
}
