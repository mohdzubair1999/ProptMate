import { analyse, issuesFrom, reliableHash, ANALYSIS_LONG_SIDE, type PhotoCheck } from "@/lib/photoQuality";

// The browser side of the photo quality check: decodes a picked photo, shrinks it, and hands the pixels to the pure checks.
// It FAILS OPEN on everything: a format the browser cannot decode (some HEIC photos), an error, or taking too long all return
// "no problems found", so a check can never stand between a person and uploading their photo.
const NOTHING_FOUND: PhotoCheck = { issues: [], hash: null, metrics: null };

async function run(file: File): Promise<PhotoCheck> {
  const bitmap = await createImageBitmap(file);
  const original = { width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, ANALYSIS_LONG_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    bitmap.close();
    return NOTHING_FOUND;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const pixels = ctx.getImageData(0, 0, w, h);
  const metrics = analyse(pixels.data, w, h, original);
  return { issues: issuesFrom(metrics), hash: reliableHash(metrics, pixels.data, w, h), metrics };
}

export async function checkPhotoFile(file: File, timeoutMs = 4000): Promise<PhotoCheck> {
  try {
    return await Promise.race([run(file), new Promise<PhotoCheck>((resolve) => setTimeout(() => resolve(NOTHING_FOUND), timeoutMs))]);
  } catch {
    return NOTHING_FOUND;
  }
}
