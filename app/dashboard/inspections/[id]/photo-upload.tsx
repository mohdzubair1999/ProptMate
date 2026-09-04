"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_UPLOAD_BYTES = 1024 * 1024; // 1MB target — comfortably under Vercel's 4.5MB
// serverless function body limit, and reduces Blob data transfer usage on every view too.
const MAX_DIMENSION_PX = 1920; // plenty for a report photo viewed on screen or in a PDF;
// resizing first is far more effective than quality alone for a huge modern phone photo.

// Resizes an image to a sensible max resolution, then reduces JPEG quality only if still
// needed to get under the target size — resizing first because a 4000x3000 photo stays
// large even at low JPEG quality, while dropping to a sane resolution does most of the work
// on its own. Falls back to the original file untouched if anything goes wrong (a corrupted
// image, an unsupported format, a canvas failure), so a compression bug never blocks the
// upload the person actually came here to do.
async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_UPLOAD_BYTES) return file; // already small enough, skip entirely

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX) {
      const scale = MAX_DIMENSION_PX / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha channel, and a canvas's default pixel state is transparent black —
    // without this, any transparent area in a PNG would flatten to black instead of white.
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    // Step quality down until under the target size or quality gets too low to bother
    // going further — 0.5 is still a perfectly usable photo for an inspection report.
    let quality = 0.85;
    let blob: Blob | null = null;
    while (quality >= 0.5) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= MAX_UPLOAD_BYTES) break;
      quality -= 0.15;
    }
    if (!blob) return file;

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file; // compression failing should never block the actual upload
  }
}

export default function PhotoUpload({ itemId, fieldId, inspectionId }: { itemId?: string; fieldId?: string; inspectionId?: string }) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState("");

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;

    setUploading(true);
    setError("");
    setProgress({ done: 0, total: files.length });

    let failures = 0;
    let lastErrorMessage = "";

    // Upload one at a time rather than in parallel — keeps things predictable on a
    // mobile connection and avoids hammering the server with many simultaneous uploads.
    for (const file of files) {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append("file", compressed);
      if (itemId) formData.append("itemId", itemId);
      if (fieldId) formData.append("fieldId", fieldId);
      if (inspectionId) formData.append("inspectionId", inspectionId);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          failures++;
          try {
            const data = await res.json();
            if (data?.error) lastErrorMessage = data.error;
          } catch {}
        }
      } catch {
        failures++;
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setUploading(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";

    if (failures > 0) {
      const base = failures === files.length ? "Upload failed" : `${failures} of ${files.length} photos failed to upload`;
      setError(lastErrorMessage ? `${base} — ${lastErrorMessage}` : `${base} — try again`);
    }

    router.refresh();
  };

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap">
        {/* Opens the device camera directly — single shot each time, most reliable across
            iOS/Android when paired with the capture attribute alone (no multiple). */}
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
          className="text-xs px-3 py-1.5 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          📷 Take photo
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
          disabled={uploading}
          className="hidden"
        />

        {/* Standard gallery picker — supports multi-select, no capture attribute so it
            doesn't fight with the camera behavior above. */}
        <button
          type="button"
          onClick={() => libraryInputRef.current?.click()}
          disabled={uploading}
          className="text-xs px-3 py-1.5 rounded-full border border-line text-ink hover:border-ink transition-colors disabled:opacity-50"
        >
          🖼 Choose from library
        </button>
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => uploadFiles(Array.from(e.target.files || []))}
          disabled={uploading}
          className="hidden"
        />
      </div>

      {uploading && (
        <p className="text-xs text-slate mt-1">
          Uploading {progress.done + 1} of {progress.total}…
        </p>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
