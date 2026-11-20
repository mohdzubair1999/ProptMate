import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { saveFieldValue } from "./actions/answers";
import { addInspectionItemDirect, saveSummaryReferenceField, updateInventoryItem } from "./actions/inspections";
import { isGenuinelyOnline } from "./connectivity";

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

// What is remembered about a write that has failed while the connection was fine.
type Failures = { attempts?: number; firstFailedAt?: number };
type StoredWrite = QueuedWrite & Failures;

interface OfflineQueueDB extends DBSchema {
  writes: {
    key: string;
    value: StoredWrite;
  };
  // Saves the server keeps refusing. Kept (never deleted without the person's say-so), but out of the waiting queue so they are not
  // retried forever and do not keep the "pending sync" banner on.
  rejected: {
    key: string;
    value: StoredWrite;
  };
}

// In production the text of an error thrown by a server action is hidden, so "refused for good" cannot be told from "try again" by
// its message. Instead: a save only counts as having FAILED when the connection was fine (see isNetworkFailure), and it is only set
// aside after failing REJECT_AFTER_ATTEMPTS times spread over at least REJECT_AFTER_MS, so a short outage or a deploy never does it.
export const REJECT_AFTER_ATTEMPTS = 3;
export const REJECT_AFTER_MS = 2 * 60 * 1000;

// A dropped or missing connection (as opposed to the server answering with an error). These never count against a write.
export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /failed to fetch|fetch failed|network|load failed|offline|connection|timed? ?out|aborted/i.test(msg);
}

let dbPromise: Promise<IDBPDatabase<OfflineQueueDB>> | null = null;

function getDB() {
  if (typeof window === "undefined") {
    // Never called server-side in practice, but keeps this module safe to import from
    // shared code without blowing up during server rendering.
    return Promise.reject(new Error("offlineQueue is client-only"));
  }
  if (!dbPromise) {
    dbPromise = openDB<OfflineQueueDB>("proptmate-offline-queue", 2, {
      upgrade(db, oldVersion) {
        // writes already waiting in version 1 are kept as they are
        if (oldVersion < 1) db.createObjectStore("writes", { keyPath: "id" });
        if (oldVersion < 2) db.createObjectStore("rejected", { keyPath: "id" });
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

// The newest answer typed for one field that is still waiting to be saved, or null if there is none. An EMPTY string is a real answer (the
// field was cleared while offline), so null, not "", means "nothing waiting". Used so a page reloaded while offline (shown from the last
// copy the browser kept) still shows what was typed since, instead of the older saved value. Never throws: if the queue cannot be read, there is nothing to show.
export async function getQueuedFieldValue(inspectionId: string, fieldId: string): Promise<string | null> {
  try {
    const db = await getDB();
    const mine = (await db.getAll("writes")).filter((w) => w.type === "saveFieldValue" && w.args[0] === inspectionId && w.args[1] === fieldId);
    if (mine.length === 0) return null;
    mine.sort((a, b) => a.createdAt - b.createdAt);
    const last = mine[mine.length - 1];
    return last.type === "saveFieldValue" && typeof last.args[2] === "string" ? last.args[2] : null;
  } catch {
    return null;
  }
}

// A direct save of a field went through, so any OLDER answer for that field still waiting in the queue is out of date and must not be sent
// later (it would overwrite the newer one). Never throws.
export async function discardQueuedFieldValues(inspectionId: string, fieldId: string): Promise<void> {
  try {
    const db = await getDB();
    const stale = (await db.getAll("writes")).filter((w) => w.type === "saveFieldValue" && w.args[0] === inspectionId && w.args[1] === fieldId);
    if (stale.length === 0) return;
    await Promise.all(stale.map((w) => db.delete("writes", w.id)));
    notifyListeners();
  } catch {
    /* if the queue cannot be read there is nothing waiting to discard */
  }
}

export async function getQueueCount(): Promise<number> {
  const db = await getDB();
  return db.count("writes");
}

// Saves the server kept refusing: how many, and what to do about them. Nothing is deleted unless the person chooses to.
export async function getRejectedWriteCount(): Promise<number> {
  const db = await getDB();
  return db.count("rejected");
}

// Puts them back in the waiting queue with a clean count (for example after signing in again, or once a problem is fixed).
export async function retryRejectedWrites(): Promise<number> {
  const db = await getDB();
  const all = await db.getAll("rejected");
  for (const w of all) {
    const { attempts: _a, firstFailedAt: _f, ...clean } = w;
    await db.put("writes", clean as StoredWrite);
    await db.delete("rejected", w.id);
  }
  notifyListeners();
  return all.length;
}

// Removes them for good. Only ever called when the person presses Discard (and confirms).
export async function discardRejectedWrites(): Promise<number> {
  const db = await getDB();
  const n = await db.count("rejected");
  await db.clear("rejected");
  notifyListeners();
  return n;
}

let isProcessing = false;

// Replays every queued write in the order it was originally made — important specifically
// for inventory items, where adding the same item twice would create a duplicate rather
// than just overwrite like a field answer does. A write that fails again (still offline, or
// a genuine server error) stays in the queue rather than being silently dropped; it'll be
// retried again on the next sync attempt.
export async function processQueue(): Promise<{ succeeded: number; failed: number; rejected?: number }> {
  // Multiple triggers can genuinely fire close together — e.g. reopening a laptop lid tends
  // to restore network connectivity and bring the tab into focus at nearly the same moment,
  // firing both the 'online' and 'focus' listeners. Without this lock, two overlapping calls
  // would both read the same pending writes before either finishes deleting them, replaying
  // — and for inventory items, duplicating — the same entry twice.
  if (isProcessing) return { succeeded: 0, failed: 0 };
  isProcessing = true;

  try {
    if (!(await isGenuinelyOnline())) return { succeeded: 0, failed: 0 };

    const db = await getDB();
    const all = await db.getAll("writes");
    all.sort((a, b) => a.createdAt - b.createdAt);

    let succeeded = 0;
    let failed = 0;
    let rejected = 0;

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
      } catch (err) {
        // Never dropped: dropping it would silently lose the person's work. A dropped connection just waits. A server error is
        // counted, and only after it has failed repeatedly over a couple of minutes is the write set aside (still kept).
        failed++;
        if (isNetworkFailure(err)) continue;
        const attempts = (write.attempts ?? 0) + 1;
        const firstFailedAt = write.firstFailedAt ?? Date.now();
        if (attempts >= REJECT_AFTER_ATTEMPTS && Date.now() - firstFailedAt >= REJECT_AFTER_MS) {
          await db.put("rejected", { ...write, attempts, firstFailedAt });
          await db.delete("writes", write.id);
          rejected++;
        } else {
          await db.put("writes", { ...write, attempts, firstFailedAt });
        }
      }
    }

    notifyListeners();
    return { succeeded, failed, rejected };
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
