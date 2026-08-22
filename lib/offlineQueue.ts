import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { saveFieldValue } from "./actions/answers";
import { addInspectionItemDirect, saveSummaryReferenceField, updateInventoryItem } from "./actions/inspections";

// Every kind of write this queue knows how to replay. Deliberately narrow — this covers
// text-based inspection form saves only (field answers, inventory items, summary reference
// fields), not photos or anything else. Photos need a genuinely different queue (large
// binary uploads can't be retried the same simple way), and that's intentionally a separate,
// later piece of work.
type QueuedWrite =
  | { id: string; type: "saveFieldValue"; args: [inspectionId: string, fieldId: string, value: string]; createdAt: number }
  | {
      id: string;
      type: "addInspectionItem";
      args: [
        inspectionId: string,
        room: string,
        itemName: string,
        condition: string,
        templateFieldId: string | null,
        make: string | undefined,
        quantity: number | undefined,
        notes: string | undefined,
        cleanliness: string | undefined
      ];
      createdAt: number;
    }
  | { id: string; type: "saveSummaryReferenceField"; args: [inspectionId: string, field: string, value: string]; createdAt: number }
  | {
      id: string;
      type: "updateInventoryItem";
      args: [itemId: string, condition: string, make: string | undefined, quantity: number | undefined, notes: string | undefined, cleanliness: string | undefined];
      createdAt: number;
    };

interface OfflineQueueDB extends DBSchema {
  writes: {
    key: string;
    value: QueuedWrite;
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineQueueDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    // Never called server-side in practice, but keeps this module safe to import from
    // shared code without blowing up during server rendering.
    return Promise.reject(new Error("offlineQueue is client-only"));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineQueueDB>("proptmate-offline-queue", 1, {
      upgrade(db) {
        db.createObjectStore("writes", { keyPath: "id" });
      },
    });
  }
  return dbPromise;
}

export async function queueWrite(write: Omit<QueuedWrite, "id" | "createdAt">) {
  const db = await getDB();
  const entry = { ...write, id: crypto.randomUUID(), createdAt: Date.now() } as QueuedWrite;
  await db.put("writes", entry);
  notifyListeners();
  return entry.id;
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count("writes");
}

let isProcessing = false;

// Replays every queued write in the order it was originally made — important specifically
// for inventory items, where adding the same item twice would create a duplicate rather
// than just overwrite like a field answer does. A write that fails again (still offline, or
// a genuine server error) stays in the queue rather than being silently dropped; it'll be
// retried again on the next sync attempt.
export async function processQueue(): Promise<{ succeeded: number; failed: number }> {
  // Multiple triggers can genuinely fire close together — e.g. reopening a laptop lid tends
  // to restore network connectivity and bring the tab into focus at nearly the same moment,
  // firing both the 'online' and 'focus' listeners. Without this lock, two overlapping calls
  // would both read the same pending writes before either finishes deleting them, replaying
  // — and for inventory items, duplicating — the same entry twice.
  if (isProcessing) return { succeeded: 0, failed: 0 };
  isProcessing = true;

  try {
    const db = await getDB();
    const all = await db.getAll("writes");
    all.sort((a, b) => a.createdAt - b.createdAt);

    let succeeded = 0;
    let failed = 0;

    for (const write of all) {
      try {
        if (write.type === "saveFieldValue") {
          await saveFieldValue(...write.args);
        } else if (write.type === "addInspectionItem") {
          await addInspectionItemDirect(...write.args);
        } else if (write.type === "saveSummaryReferenceField") {
          await saveSummaryReferenceField(...write.args);
        } else if (write.type === "updateInventoryItem") {
          await updateInventoryItem(...write.args);
        }
        await db.delete("writes", write.id);
        succeeded++;
      } catch {
        // Left in the queue deliberately — could be still offline, or a real server error.
        // Either way, dropping it here would silently lose the person's work.
        failed++;
      }
    }

    notifyListeners();
    return { succeeded, failed };
  } finally {
    isProcessing = false;
  }
}

// Simple pub/sub so UI components (the pending-sync indicator) can react to the queue
// changing without polling IndexedDB on a timer.
type Listener = () => void;
const listeners = new Set<Listener>();

function notifyListeners() {
  listeners.forEach((l) => l());
}

export function subscribeToQueueChanges(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Auto-sync whenever the browser regains connectivity — the whole point of this queue is
// that the person doesn't have to remember to do anything themselves.
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    processQueue();
  });
}
