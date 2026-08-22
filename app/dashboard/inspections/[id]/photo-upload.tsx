"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

    // Upload one at a time rather than in parallel — keeps things predictable on a
    // mobile connection and avoids hammering the server with many simultaneous uploads.
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      if (itemId) formData.append("itemId", itemId);
      if (fieldId) formData.append("fieldId", fieldId);
      if (inspectionId) formData.append("inspectionId", inspectionId);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) failures++;
      } catch {
        failures++;
      }

      setProgress((p) => ({ ...p, done: p.done + 1 }));
    }

    setUploading(false);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (libraryInputRef.current) libraryInputRef.current.value = "";

    if (failures > 0) {
      setError(failures === files.length ? "Upload failed — try again" : `${failures} of ${files.length} photos failed to upload`);
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
