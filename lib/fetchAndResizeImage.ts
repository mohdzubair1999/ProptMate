import sharp from "sharp";

export async function fetchAndResizeImage(url: string, maxDimension = 1568): Promise<{ base64: string; mediaType: string }> {
  const imgRes = await fetch(url);
  if (!imgRes.ok) throw new Error("Could not download photo");
  const buffer = Buffer.from(await imgRes.arrayBuffer());

  const resized = await sharp(buffer)
    .rotate() // respect EXIF orientation so phone photos aren't sideways
    .resize({ width: maxDimension, height: maxDimension, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { base64: resized.toString("base64"), mediaType: "image/jpeg" };
}
