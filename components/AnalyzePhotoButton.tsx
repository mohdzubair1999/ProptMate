"use client";

import { setReactControlledValue } from "@/lib/reactInputHelper";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { appendItemNotes } from "@/lib/actions/inspections";

// Sits once per item/field (not once per photo) — analyzes ALL its photos together in a
// single combined description, since multiple photos of the same item are usually just
// different angles of one situation, not separate issues.
export default function AnalyzePhotoButton({
  photoUrls,
  targetId,
  itemId,
  inspectionId,
  context,
  identifyRoom,
  existingNotesValue,
  matchRoom,
  matchLabel,
}: {
  photoUrls: string[];
  targetId?: string;
  itemId?: string;
  inspectionId?: string;
  context?: string;
  // Set this when photos might be pooled from different rooms with no already-known room
  // per photo (e.g. a single Maintenance section covering the whole property) — the AI will
  // try to identify each photo's room from what's visible and give a per-photo breakdown,
  // instead of assuming every photo is the same item and writing one combined description.
  identifyRoom?: boolean;
  // Pass the current notes text directly when the notes field isn't reliably present in the
  // DOM alongside this button (e.g. a view/edit-mode toggle where only one is ever mounted at
  // a time) — takes precedence over the targetId DOM lookup below when provided.
  existingNotesValue?: string;
  // The room name and item/field name to match against a prior check-in report - only used
  // for a check-out inspection, where it lets the AI compare current condition against what
  // was actually recorded at check-in rather than describing current state in isolation.
  // Harmless to pass for any other inspection type; the server only ever acts on it for a
  // genuine check-out.
  matchRoom?: string;
  matchLabel?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<"openai" | "anthropic">("anthropic");
  // Tracks whether the result just produced was answering an instruction (existing text
  // treated as a command) rather than a generic description of the photo — mirrors exactly
  // when the server treats existingNotes as an instruction, so the save/insert behavior below
  // stays in sync with what was actually asked of the AI.
  const [answeredInstruction, setAnsweredInstruction] = useState(false);
  // Tracks progress ("2 of 5 batches complete") for a large photo set split across multiple requests.
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  // Shows a "combining results" message during the extra synthesis step for multi-batch,
  // non-room-identifying results, so there's no unexplained delay after batches finish.
  const [synthesizing, setSynthesizing] = useState(false);

  // The server caps a single request at 40 photos - not an arbitrary number, but the actual
  // safe ceiling given Anthropic's real request size limit (32MB total, base64-encoded): even
  // 100 photos at the resolution this app sends can exceed that, and 200 reliably would. So a
  // large photo set is split into several safely-sized requests here instead, sent one after
  // another, with their results combined - rather than trying to raise the per-request limit
  // itself, which would just fail differently (a request-too-large error) instead of working.
  const BATCH_SIZE = 40;
  function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  const analyze = async () => {
    if (photoUrls.length === 0) return;
    setLoading(true);
    setError("");
    setResult("");
    setSaved(false);
    setBatchProgress(null);
    setSynthesizing(false);

    // If there's already text in the linked notes field (e.g. the inspector typed
    // "damp in bedroom 2" before running analysis), pass it along — it's a much stronger
    // hint for identifying the room than the photo alone, and gives the AI real context to
    // build on rather than describe the photo in isolation, disconnected from notes already
    // written about the same item.
    const existingNotes = existingNotesValue !== undefined ? existingNotesValue.trim() : targetId ? (document.getElementById(targetId) as HTMLTextAreaElement | null)?.value.trim() : "";
    // Matches the server's exact condition for treating existingNotes as an instruction
    // rather than passive context (see analyze-photo/route.ts's notesHint) — kept in sync so
    // the save/insert behavior below never disagrees with what was actually asked of the AI.
    const isInstruction = !identifyRoom && !!existingNotes;
    setAnsweredInstruction(isInstruction);

    const batches = chunk(photoUrls, BATCH_SIZE);
    const descriptions: (string | null)[] = new Array(batches.length).fill(null);
    const failedBatches: number[] = [];
    let completedCount = 0;

    try {
      if (batches.length > 1) setBatchProgress({ current: 0, total: batches.length });

      // Run all batches in parallel rather than one after another - each is an independent
      // request, so waiting for them sequentially would take roughly batches.length times as
      // long for no real benefit. For 200 photos across 5 batches, that's the difference
      // between the whole thing finishing in around the time of one batch versus up to five
      // times that.
      await Promise.all(
        batches.map(async (batch, i) => {
          try {
            const res = await fetch("/api/ai/analyze-photo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ photoUrls: batch, context, provider, identifyRoom, existingNotes, inspectionId, matchRoom, matchLabel }),
            });
            const data = await res.json();

            if (!res.ok) {
              failedBatches.push(i + 1);
            } else {
              descriptions[i] = data.description;
            }
          } catch {
            failedBatches.push(i + 1);
          } finally {
            completedCount++;
            if (batches.length > 1) setBatchProgress({ current: completedCount, total: batches.length });
          }
        })
      );

      const successfulDescriptions = descriptions.filter((d): d is string => d !== null);

      if (successfulDescriptions.length === 0) {
        setError("Something went wrong");
        return;
      }

      // A single batch (the overwhelming majority of real cases, since most items have far
      // fewer than 40 photos) just uses its one result directly, unchanged from before.
      // Multiple batches for a plain description are each full prose written as if it were
      // the complete answer, independently, without seeing each other - so they're combined
      // with an extra AI call below rather than just concatenated, which would otherwise read
      // as repetitive, disjointed summaries of the same thing. identifyRoom mode below has its
      // own, more direct fix instead, since it just needs same-room lines re-grouped, not a
      // full rewrite.
      let combined: string;
      if (successfulDescriptions.length === 1) {
        combined = successfulDescriptions[0];
      } else if (identifyRoom) {
        // Same room can genuinely end up split across two different batches (batching is by
        // position, not by room), which a plain join would leave as two separate, duplicate
        // lines for the same room. Re-parses and re-groups every "Room: description" line
        // across all batches combined, exactly replicating the server's own per-batch merging
        // logic (see analyze-photo/route.ts) so the result reads identically to what a single,
        // unbatched request would have produced.
        const roomOrder: string[] = [];
        const roomDescriptions = new Map<string, string[]>();
        for (const desc of successfulDescriptions) {
          for (const rawLine of desc.split("\n")) {
            const line = rawLine.trim();
            if (!line) continue;
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) continue;
            const room = line.slice(0, colonIndex).trim();
            const description = line.slice(colonIndex + 1).trim();
            if (!room || !description) continue;
            const key = room.toLowerCase();
            if (!roomDescriptions.has(key)) {
              roomOrder.push(room);
              roomDescriptions.set(key, []);
            }
            roomDescriptions.get(key)!.push(description);
          }
        }
        combined =
          roomOrder.length > 0
            ? roomOrder.map((room) => `${room}: ${roomDescriptions.get(room.toLowerCase())!.join(" ")}`).join("\n\n")
            : successfulDescriptions.join("\n"); // unexpected format - fall back rather than show nothing
      } else {
        setSynthesizing(true);
        try {
          const synthesisRes = await fetch("/api/ai/synthesize-descriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ descriptions: successfulDescriptions, context, provider, inspectionId }),
          });
          const synthesisData = await synthesisRes.json();
          if (synthesisRes.ok && synthesisData.description) {
            combined = synthesisData.description;
          } else {
            throw new Error("synthesis failed");
          }
        } catch {
          // The synthesis step is a nice-to-have polish on top of already-successful batch
          // results - if it fails for any reason, fall back to labelling each batch's
          // contribution honestly rather than losing what was already successfully analysed.
          combined = descriptions
            .map((d, i) => (d === null ? null : `[Photos ${i * BATCH_SIZE + 1}–${Math.min((i + 1) * BATCH_SIZE, photoUrls.length)}]\n${d}`))
            .filter((d): d is string => d !== null)
            .join("\n\n");
        } finally {
          setSynthesizing(false);
        }
      }

      const finalDescription = failedBatches.length > 0 ? `${combined}\n\n⚠ Couldn't analyse ${failedBatches.length === 1 ? "one batch" : `${failedBatches.length} batches`} of photos — try again to fill in the rest.` : combined;

      if (targetId) {
        const target = document.getElementById(targetId) as HTMLTextAreaElement | null;
        if (target) {
          const existing = target.value.trim();
          // When the existing text was answered as an instruction, replace it with the
          // answer rather than stacking both — the original command was a request to run,
          // not content meant to sit in the final report next to its own answer. Otherwise
          // (identifyRoom mode, or no existing text), keep the original append behavior.
          setReactControlledValue(target, isInstruction ? finalDescription : existing ? `${existing}\n\n${finalDescription}` : finalDescription);
        }
      } else {
        setResult(finalDescription);
      }
    } finally {
      setLoading(false);
      setBatchProgress(null);
      setSynthesizing(false);
    }
  };

  const saveToNotes = async () => {
    if (!itemId || !inspectionId || !result) return;
    setSaving(true);
    try {
      await appendItemNotes(itemId, result, inspectionId, answeredInstruction);
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (photoUrls.length === 0) return null;

  return (
    <div className="mt-1">
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={analyze}
          disabled={loading}
          className="text-xs px-2.5 py-1 rounded-full border border-line text-slate hover:border-signal hover:text-signal transition-colors disabled:opacity-50"
        >
          {loading
            ? synthesizing
              ? "Combining results…"
              : batchProgress
              ? `Analysing… ${batchProgress.current} of ${batchProgress.total} batches complete`
              : photoUrls.length > 15
              ? `Analysing ${photoUrls.length} photos… this may take up to a minute`
              : "Analysing…"
            : photoUrls.length > 1
            ? `👁 Analyse all ${photoUrls.length} photos with AI`
            : "👁 Analyse with AI"}
        </button>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as "openai" | "anthropic")}
          className="text-xs border border-line rounded-full px-2 py-1 text-slate bg-white"
        >
          <option value="anthropic">Claude</option>
          <option value="openai">OpenAI</option>
        </select>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {result && (
        <div className="mt-1 max-w-md">
          <p className="text-xs text-ink bg-paper rounded-lg p-2 whitespace-pre-wrap">{result}</p>
          {itemId && inspectionId && !saved && (
            <button
              type="button"
              onClick={saveToNotes}
              disabled={saving}
              className="text-xs px-2.5 py-1 mt-1 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "💾 Save to notes"}
            </button>
          )}
          {saved && <p className="text-xs text-verified mt-1">Saved to item notes.</p>}
        </div>
      )}
    </div>
  );
}
