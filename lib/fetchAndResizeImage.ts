import sharp from "sharp";
import { fetchPhotoBuffer, validatePhotoUrl } from "@/lib/photoUrl";

// What the AI is shown: upright (phones store photos sideways with a tag), no larger than it reads well, and with the
// photo's hidden data (including GPS location) stripped, because the picture is re-encoded.
export async function resizeForVision(buffer: Buffer, maxDimension = 1568): Promise<{ base64: string; mediaType: string }> {
  const resized = await sharp(buffer)
    .rotate() // respect EXIF orientation so phone photos aren't sideways
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();
  return { base64: resized.toString("base64"), mediaType: "image/jpeg" };
}

// restrictToStorage: pass true for any address that came from a browser, so only ProptMate's own photo storage is
// ever fetched. Addresses the server itself read from the database do not need it.
export async function fetchAndResizeImage(url: string, maxDimension = 1568, opts: { restrictToStorage?: boolean; fetchImpl?: typeof fetch } = {}): Promise<{ base64: string; mediaType: string }> {
  if (opts.restrictToStorage) {
    const check = validatePhotoUrl(url);
    if (!check.ok) throw new Error("Photo address not allowed");
    url = check.url;
  }
  return resizeForVision(await fetchPhotoBuffer(url, { fetchImpl: opts.fetchImpl }), maxDimension);
}
