import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isGenuinelyOnline } from "./connectivity";

// A photo taken or picked while offline. Kept in its own store and its own IndexedDB
// database (separate from offlineQueue.ts's "writes" store) rather than folded in with text
// mutations, since photo blobs are far larger and benefit from being queried and cleaned up
// independently - exactly the reasoning offlineQueue.ts's own comment already gives for
// treating photos as "a genuinely different queue".
type QueuedPhoto = {
  id: string;
  // set only on photos the server has permanently refused (see processPhotoQueue)
  rejected?: { status: number; at: number };
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
  // Photos the server will never accept. Kept (never deleted without the person's say-so), but out of the waiting queue so they
  // are not retried forever and do not keep the "pending sync" banner on.
  rejected: {
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
    dbPromise = openDB<PhotoQueueDB>("proptmate-offline-photos", 2, {
      upgrade(db, oldVersion) {
        // photos already waiting in version 1 are kept as they are
        if (oldVersion < 1) db.createObjectStore("photos", { keyPath: "id" });
        if (oldVersion < 2) db.createObjectStore("rejected", { keyPath: "id" });
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

// Photos the server refused for good: how many, and what to do about them. Nothing is ever deleted unless the person chooses to.
export async function getRejectedPhotoCount(): Promise<number> {
  const db = await getDB();
  return db.count("rejected");
}

// Puts the refused photos back in the waiting queue to be sent again (for example if the refusal turns out to be fixed).
export async function retryRejectedPhotos(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("rejected");
  for (const photo of all) {
    const { rejected: _gone, ...clean } = photo;
    await db.put("photos", clean);
    await db.delete("rejected", photo.id);
  }
  notifyListeners();
  return all.length;
}

// Removes them for good. Only ever called when the person presses Discard.
export async function discardRejectedPhotos(): Promise<number> {
  const db = await getDB();
  const n = await db.count("rejected");
  await db.clear("rejected");
  notifyListeners();
  return n;
}

let isProcessing = false;

// Replays every queued photo upload in the order it was originally taken. Mirrors
// processQueue in offlineQueue.ts - the same overlapping-trigger lock (a laptop waking from
// sleep can fire 'online' and 'focus' within the same moment), the same "leave it in the
// queue on failure rather than silently lose the photo" reasoning.
// The server saying a photo itself is wrong, so sending it again can never help: not a valid request, not found (the inspection
// was deleted, or has since been submitted), too large, not an image, not processable. Anything else (signed out, busy, a
// server error, no connection) is temporary and is tried again.
export const PERMANENT_REFUSALS = new Set([400, 404, 413, 415, 422]);

export async function processPhotoQueue(): Promise<{ succeeded: number; failed: number; rejected?: number }> {
  if (isProcessing) return { succeeded: 0, failed: 0 };
  isProcessing = true;

  try {
    if (!(await isGenuinelyOnline())) return { succeeded: 0, failed: 0 };

    const db = await getDB();
    const all = await db.getAll("photos");
    all.sort((a, b) => a.createdAt - b.createdAt);

    let succeeded = 0;
    let failed = 0;
    let rejected = 0;

    for (const photo of all) {
      try {
        const formData = new FormData();
        const file = new File([photo.blob], photo.fileName, { type: photo.mimeType });
        formData.append("file", file);
        if (photo.itemId) formData.append("itemId", photo.itemId);
        if (photo.fieldId) formData.append("fieldId", photo.fieldId);
        if (photo.inspectionId) formData.append("inspectionId", photo.inspectionId);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (!res.ok) {
          if (PERMANENT_REFUSALS.has(res.status)) {
            // keep the photo, but out of the waiting queue: written to the rejected store BEFORE it is removed from this one
            await db.put("rejected", { ...photo, rejected: { status: res.status, at: Date.now() } });
            await db.delete("photos", photo.id);
            rejected++;
            continue;
          }
          throw new Error(`Upload failed (${res.status})`);
        }

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
    return { succeeded, failed, rejected };
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
