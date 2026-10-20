import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isGenuinelyOnline } from "./connectivity";

// A photo taken or picked while offline. Kept in its own store and its own IndexedDB
// database (separate from offlineQueue.ts's "writes" store) rather than folded in with text
// mutations, since photo blobs are far larger and benefit from being queried and cleaned up
// independently - exactly the reasoning offlineQueue.ts's own comment already gives for
// treating photos as "a genuinely different queue".
type QueuedPhoto = {
  id: string;
  inspectionId: string;
  itemId?: string;
  fieldId?: string;
  blob: Blob;
  fileName: string;
  mimeType: string;
  createdAt: number;
};

interface PhotoQueueDB extends DBSchema {
  photos: {
    key: string;
    value: QueuedPhoto;
  };
}

let dbPromise: Promise<IDBPDatabase<PhotoQueueDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    // Never called server-side in practice, but keeps this module safe to import from
    // shared code without blowing up during server rendering - same guard as offlineQueue.ts.
    return Promise.reject(new Error("offlinePhotoQueue is client-only"));
  }
  if (!dbPromise) {
    dbPromise = openDB<PhotoQueueDB>("proptmate-offline-photos", 1, {
      upgrade(db) {
        db.createObjectStore("photos", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function queuePhoto(photo: Omit<QueuedPhoto, "id" | "createdAt">): Promise<string> {
  const db = await getDB();
  const entry: QueuedPhoto = { ...photo, id: crypto.randomUUID(), createdAt: Date.now() };
  await db.put("photos", entry);
  notifyListeners();
  return entry.id;
}

export async function getPhotoQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count("photos");
}

let isProcessing = false;

// Replays every queued photo upload in the order it was originally taken. Mirrors
// processQueue in offlineQueue.ts - the same overlapping-trigger lock (a laptop waking from
// sleep can fire 'online' and 'focus' within the same moment), the same "leave it in the
// queue on failure rather than silently lose the photo" reasoning.
export async function processPhotoQueue(): Promise<{ succeeded: number; failed: number }> {
  if (isProcessing) return { succeeded: 0, failed: 0 };
  isProcessing = true;

  try {
    if (!(await isGenuinelyOnline())) return { succeeded: 0, failed: 0 };

    const db = await getDB();
    const all = await db.getAll("photos");
    all.sort((a, b) => a.createdAt - b.createdAt);

    let succeeded = 0;
    let failed = 0;

    for (const photo of all) {
      try {
        const formData = new FormData();
        const file = new File([photo.blob], photo.fileName, { type: photo.mimeType });
        formData.append("file", file);
        if (photo.itemId) formData.append("itemId", photo.itemId);
        if (photo.fieldId) formData.append("fieldId", photo.fieldId);
        if (photo.inspectionId) formData.append("inspectionId", photo.inspectionId);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);

        await db.delete("photos", photo.id);
        succeeded++;
      } catch {
        // Left in the queue deliberately, same as offlineQueue.ts - could be still offline,
        // or a genuine upload error. Either way, dropping it here would silently lose the
        // person's photo.
        failed++;
      }
    }

    notifyListeners();
    return { succeeded, failed };
  } finally {
    isProcessing = false;
  }
}

// Simple pub/sub so UI components can react to the photo queue changing without polling
// IndexedDB on a timer - same pattern as offlineQueue.ts's own listener set.
type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

export function subscribeToPhotoQueueChanges(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Auto-sync whenever the browser regains connectivity, same trigger as offlineQueue.ts -
// both fire independently on the same 'online' event, which is fine since each only touches
// its own store.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    processPhotoQueue();
  });
}
