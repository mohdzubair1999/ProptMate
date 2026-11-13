import { NextResponse } from "next/server";
import sharp from "sharp";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { inspectionAccess } from "@/lib/access";
import { userRateLimit } from "@/lib/aiGuard";
import { fetchPhotoBuffer, validatePhotoUrl } from "@/lib/photoUrl";
import { markupSvg, parseShapes } from "@/lib/photoMarkup";

export const maxDuration = 30;
const MAX_PIXELS = 100_000_000; // refuse absurdly large images rather than risk the server's memory

// Saves a MARKED-UP COPY of a photo: the original is fetched, the marks are drawn on it, and the result is stored as a new photo on the same item or
// answer. The original photo is never changed or removed. The copy is a plain JPEG without any hidden location or camera details.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limited = await userRateLimit(session, "photo-markup", { max: 60, windowMin: 15 });
  if (limited) return limited;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const photoId = typeof body?.photoId === "string" && body.photoId.length > 0 && body.photoId.length <= 100 ? body.photoId : null;
  if (!photoId) return NextResponse.json({ error: "Choose a photo to mark up" }, { status: 400 });
  const parsed = parseShapes(body?.shapes);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // only a photo on an inspection this person may reach (their company's, or one assigned to them as a client)
  const access = inspectionAccess(session.user as any);
  const photo = await prisma.photo.findFirst({
    where: { id: photoId, OR: [{ inspectionItem: { inspection: access } }, { fieldAnswer: { inspection: access } }] },
    select: { id: true, url: true, inspectionItemId: true, fieldAnswerId: true, inspectionItem: { select: { inspection: { select: { status: true } } } }, fieldAnswer: { select: { inspection: { select: { status: true } } } } },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  const status = photo.inspectionItem?.inspection?.status ?? photo.fieldAnswer?.inspection?.status;
  if (status !== "draft") return NextResponse.json({ error: "This inspection is completed, so its photos can't be changed" }, { status: 409 });

  const checked = validatePhotoUrl(photo.url);
  if (!checked.ok) return NextResponse.json({ error: "Couldn't load that photo" }, { status: 502 });
  let original: Buffer;
  try { original = await fetchPhotoBuffer(checked.url); } catch { return NextResponse.json({ error: "Couldn't load that photo" }, { status: 502 }); }

  let marked: Buffer;
  try {
    const meta = await sharp(original, { failOn: "none", limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.width || !meta.height) throw new Error("no size");
    // a phone photo can be stored sideways with a tag: the marks are placed on the photo as it is SEEN, so the size is taken after turning it upright
    const turned = (meta.orientation ?? 1) >= 5;
    const W = turned ? meta.height : meta.width, H = turned ? meta.width : meta.height;
    marked = await sharp(original, { failOn: "none", limitInputPixels: MAX_PIXELS })
      .rotate()
      .composite([{ input: Buffer.from(markupSvg(parsed.shapes, W, H)), top: 0, left: 0 }])
      .jpeg({ quality: 88 }) // no metadata is kept: location, camera and time details are not copied
      .toBuffer();
  } catch {
    return NextResponse.json({ error: "That photo couldn't be marked up (it may be too large or damaged)" }, { status: 422 });
  }

  const owner = photo.inspectionItemId ? { folder: "inspection-photos", id: photo.inspectionItemId } : { folder: "field-photos", id: photo.fieldAnswerId! };
  const blob = await put(`${owner.folder}/${owner.id}-markup-${Date.now()}.jpg`, marked, { access: "public", contentType: "image/jpeg" });
  try {
    const copy = await prisma.photo.create({ data: photo.inspectionItemId ? { inspectionItemId: photo.inspectionItemId, url: blob.url } : { fieldAnswerId: photo.fieldAnswerId!, url: blob.url }, select: { id: true, url: true } });
    return NextResponse.json({ photo: copy }, { status: 201 });
  } catch (err) {
    // the picture was stored but the record could not be made: do not leave an orphan file behind
    console.error("Could not save the marked-up photo record:", err);
    try { await del(blob.url); } catch { /* nothing more to do */ }
    return NextResponse.json({ error: "Couldn't save the marked-up photo - please try again" }, { status: 500 });
  }
}
