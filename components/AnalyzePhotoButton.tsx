"use client";

import { getFieldValue, setReactControlledValue } from "@/lib/reactInputHelper";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appendItemNotes } from "@/lib/actions/inspections";
import { DETAILED_BATCH_SIZE, DETAILED_CONCURRENCY, QUICK_BATCH_SIZE, QUICK_CONCURRENCY, autoContinueSeconds, batchNotices, countdownText, parseRetryAfter, photoCountOf, photoRanges, runBatches } from "@/lib/analyseBatches";
import { mergeBulletBlocks } from "@/lib/reportComments";

// What one successful batch gave back, kept so a later run can carry on without repeating it
type Hints = { visibleText: string[]; safety: string[]; closerPhotoFor: string[]; possible: string[] };
type BatchData = { description: string; truncated: boolean; compared: number; warnings: string[]; hints: Hints; detailPass: string | null };

// Pulls any [CLARIFY: question] markers out of the AI's text - each one is a genuinely
// important uncertainty (material, severity) the AI couldn't resolve from the photo alone,
// which the inspector standing on site can resolve in seconds. Stripped from the displayed
// description and surfaced as its own answerable question instead, so the saved notes never
// end up with a bracketed AI question sitting inside what's meant to be a formal report.
function parseClarifications(text: string): { cleanText: string; questions: string[] } {
  const questions: string[] = [];
  const withoutMarkers = text.replace(/\[CLARIFY:\s*([^\]]+)\]/g, (_match, question) => {
    questions.push(question.trim());
    return "";
  });
  const cleanText = withoutMarkers
    .split("\n")
    // A bullet whose only content was the marker now just removed (e.g. "- [CLARIFY: ...]")
    // is left as a bare "-" with nothing after it - drop that line entirely rather than leave
    // an empty bullet point in the saved text. Genuinely blank lines (paragraph breaks) are
    // untouched here; those are handled by the \n{3,} collapse below, same as before.
    .filter((line) => !/^[-•*]\s*$/.test(line.trim()))
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanText, questions };
}

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
  const [clarifications, setClarifications] = useState<{ question: string; answer: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState<"openai" | "anthropic">("anthropic");
  // Deep uses a more capable (and costlier) AI model for this analysis - only when chosen.
  // Detailed (the default) looks closely at every photo with the more capable model; Quick is the cheaper, faster, less thorough one.
  const [depth, setDepth] = useState<"standard" | "detailed">("detailed");
  // what the analysis noticed that is not part of the description: readable labels, safety concerns, and where a closer photo would show more
  const [hints, setHints] = useState<Hints | null>(null);
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
  // Set when an inventory answer still has advice or a "not tested" remark in it after the automatic rewrite
  const [wordingWarnings, setWordingWarnings] = useState<string[]>([]);
  // At a check-out: how many check-in photos of this item the AI compared the new photos against
  const [comparedWith, setComparedWith] = useState(0);
  // Things to tell the person about the run (what was not analysed and why). Shown beside the button: they are NOT typed into the notes.
  const [notices, setNotices] = useState<string[]>([]);
  // Batches already analysed, so "try again" sends only what is missing. Kept only while the photos and settings are the same.
  const progressRef = useRef<{ key: string; batches: Map<number, BatchData>; existingNotes: string; isInstruction: boolean; inserted: string | null; missing: number } | null>(null);
  const [remaining, setRemaining] = useState<{ key: string; photos: number } | null>(null);
  // After a limit stops a run, wait for the window to pass and carry on by itself (only the missing photos), with a countdown the person can stop.
  const [autoWait, setAutoWait] = useState<{ until: number } | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const autoRoundsRef = useRef(0);
  const analyzeRef = useRef<(auto?: boolean) => Promise<void>>(async () => {});
  // Leaving the page cancels everything still in flight (a run nobody can see any more must not keep spending AI), and the Stop button cancels a run on purpose.
  const abortRef = useRef<AbortController | null>(null); // the batches: stopped by Stop or by leaving
  const synthAbortRef = useRef<AbortController | null>(null); // the combining step: stopped only by leaving (Stop still combines what was done)
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => { unmountedRef.current = true; abortRef.current?.abort(); synthAbortRef.current?.abort(); };
  }, []);
  const currentKey = useMemo(() => JSON.stringify([photoUrls, depth, provider, !!identifyRoom, context ?? "", matchRoom ?? "", matchLabel ?? "", inspectionId ?? ""]), [photoUrls, depth, provider, identifyRoom, context, matchRoom, matchLabel, inspectionId]);

  // The server caps a single request at 40 photos - not an arbitrary number, but the actual
  // safe ceiling given Anthropic's real request size limit (32MB total, base64-encoded): even
  // 100 photos at the resolution this app sends can exceed that, and 200 reliably would. So a
  // large photo set is split into several safely-sized requests here instead, sent one after
  // another, with their results combined - rather than trying to raise the per-request limit
  // itself, which would just fail differently (a request-too-large error) instead of working.
  // A detailed analysis gives each photo close attention, so it is sent four at a time; the quick one takes 40.
  const BATCH_SIZE = depth === "detailed" ? DETAILED_BATCH_SIZE : QUICK_BATCH_SIZE;
  function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
  }

  const analyze = async (auto = false) => {
    if (photoUrls.length === 0) return;
    if (!auto) {
      autoRoundsRef.current = 0; // a press by the person starts the count of automatic rounds again
      setAutoWait(null);
    } else {
      autoRoundsRef.current += 1;
      if (clarifications.some((c) => c.answer.trim())) {
        // an answer typed into a question would be lost when the new result arrives: do not carry on by itself, let the person add it first
        setNotices((prev) => [...prev, "Paused: you have typed an answer to a question that has not been added yet. Add it (or clear it), then press the button to carry on."]);
        return;
      }
    }
    if (!auto && clarifications.some((c) => c.answer.trim())) {
      const proceed = window.confirm("You've typed an answer to a question above that hasn't been added yet - running analysis again will lose it. Continue anyway?");
      if (!proceed) return;
    }
    setLoading(true);
    setError("");
    setResult("");
    setWordingWarnings([]);
    setComparedWith(0);
    setClarifications([]);
    setSaved(false);
    setBatchProgress(null);
    setSynthesizing(false);
    setNotices([]);

    // If there's already text in the linked notes field (e.g. the inspector typed
    // "damp in bedroom 2" before running analysis), pass it along — it's a much stronger
    // hint for identifying the room than the photo alone, and gives the AI real context to
    // build on rather than describe the photo in isolation, disconnected from notes already
    // written about the same item.
    // The same photos and settings as an earlier run that did not finish: carry on with only the missing batches, keeping what is already done.
    const prev = progressRef.current;
    const resuming = !!prev && prev.key === currentKey && prev.missing > 0;
    const existingNotes = resuming ? prev!.existingNotes : existingNotesValue !== undefined ? existingNotesValue.trim() : targetId ? getFieldValue(document.getElementById(targetId) as HTMLElement).trim() : "";
    // Matches the server's exact condition for treating existingNotes as an instruction rather than passive context (see analyze-photo/route.ts's notesHint).
    // On a carry-on run the answer from the first run is already in the field, so the first run's own decision is kept.
    const isInstruction = resuming ? prev!.isInstruction : !identifyRoom && !!existingNotes;
    setAnsweredInstruction(isInstruction);

    const batches = chunk(photoUrls, BATCH_SIZE);
    const state = resuming ? prev! : { key: currentKey, batches: new Map<number, BatchData>(), existingNotes, isInstruction, inserted: null as string | null, missing: 0 };
    const earlierInserted = resuming ? state.inserted : null; // what the earlier, unfinished run put in the notes: the finished text replaces it
    progressRef.current = state;
    const controller = new AbortController();
    abortRef.current = controller;
    setHints(null);

    try {
      if (batches.length > 1) setBatchProgress({ current: state.batches.size, total: batches.length });

      // The batches are sent a few at a time (not all at once), and sending stops as soon as the server says it has reached its limit: the server allows only so many
      // requests in a window of time, and a big set sent all at once used to run into that and lose most of the batches. See lib/analyseBatches.ts.
      const outcome = await runBatches<BatchData>({
        total: batches.length,
        done: state.batches,
        signal: controller.signal,
        concurrency: depth === "detailed" ? DETAILED_CONCURRENCY : QUICK_CONCURRENCY,
        onProgress: (doneCount, total) => { if (total > 1 && !unmountedRef.current) setBatchProgress({ current: doneCount, total }); },
        run: async (i) => {
          let res: Response;
          try {
            res = await fetch("/api/ai/analyze-photo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ photoUrls: batches[i], context, provider, depth, identifyRoom, existingNotes, inspectionId, matchRoom, matchLabel }),
              signal: controller.signal,
            });
          } catch {
            return { ok: false, status: controller.signal.aborted ? -1 : 0 }; // cancelled is not the same as failed
          }
          let data: any = null;
          try { data = await res.json(); } catch { /* the answer was not JSON */ }
          if (res.ok && data && typeof data.description === "string") {
            const take = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === "string") : []);
            return {
              ok: true,
              data: {
                description: data.description,
                truncated: !!data.wasTruncated,
                compared: typeof data.comparedWithCheckIn === "number" ? Math.floor(data.comparedWithCheckIn) : 0,
                warnings: take(data.wordingWarnings),
                hints: data.hints && typeof data.hints === "object" ? { visibleText: take(data.hints.visibleText), safety: take(data.hints.safety), closerPhotoFor: take(data.hints.closerPhotoFor), possible: take(data.hints.possible) } : { visibleText: [], safety: [], closerPhotoFor: [], possible: [] },
                detailPass: typeof data.detailPass === "string" ? data.detailPass : null,
              },
            };
          }
          return { ok: false, status: res.status, message: typeof data?.error === "string" ? data.error : undefined, retryAfterSeconds: parseRetryAfter(res.headers.get("Retry-After")) };
        },
      });
      if (unmountedRef.current) return; // the person has left: nothing more to do, and nothing more to spend
      state.batches = outcome.done;
      state.missing = outcome.failed.length + outcome.notStarted.length;
      const missingPhotos = photoCountOf([...outcome.failed, ...outcome.notStarted], BATCH_SIZE, photoUrls.length);
      setRemaining(state.missing > 0 ? { key: currentKey, photos: missingPhotos } : null);
      // A limit (not a fault, not the daily limit) is waited out and the rest is sent by itself, a few rounds at most
      const waitSeconds = state.missing > 0 && !outcome.serviceTrouble ? autoContinueSeconds(outcome.limit, autoRoundsRef.current) : null;
      setAutoWait(waitSeconds !== null ? { until: Date.now() + waitSeconds * 1000 } : null);
      const lines = batchNotices({ failed: outcome.failed, notStarted: outcome.notStarted, limit: outcome.limit, serviceTrouble: outcome.serviceTrouble, batchSize: BATCH_SIZE, photoCount: photoUrls.length, willContinue: waitSeconds !== null, cancelled: outcome.cancelled });

      const entries = [...outcome.done.entries()].sort((a, b) => a[0] - b[0]);
      const successful = entries.map(([, d]) => d);
      const successfulDescriptions = successful.map((d) => d.description);
      const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, 12);
      const merged = { visibleText: uniq(successful.flatMap((d) => d.hints.visibleText)), safety: uniq(successful.flatMap((d) => d.hints.safety)), closerPhotoFor: uniq(successful.flatMap((d) => d.hints.closerPhotoFor)), possible: uniq(successful.flatMap((d) => d.hints.possible)) };
      setHints(merged.visibleText.length + merged.safety.length + merged.closerPhotoFor.length + merged.possible.length > 0 ? merged : null);

      if (successfulDescriptions.length === 0) {
        // Nothing was analysed. If a limit was the reason, say so plainly (it is not "something went wrong"); the same photos can be tried again later.
        setNotices(lines);
        setError(outcome.limit || outcome.cancelled ? "" : "Something went wrong");
        return;
      }

      // A single batch (the overwhelming majority of real cases, since most items have far fewer photos) just uses its one result directly. Several batches for a
      // plain description are each written as if it were the complete answer, so they are combined with an extra AI call rather than just joined.
      let combined: string;
      let synthesisWarnings: string[] | null = null;
      if (successfulDescriptions.length === 1) {
        combined = successfulDescriptions[0];
      } else if (!identifyRoom && mergeBulletBlocks(successfulDescriptions) !== null) {
        // Several batches written in the report's own layout (one bullet per element) are combined RIGHT HERE: the same element from different batches becomes one
        // bullet, repeated sentences once. No extra AI call (so no extra wait), and nothing can be lost or reworded in the combining.
        combined = mergeBulletBlocks(successfulDescriptions) as string;
      } else if (identifyRoom) {
        // The same room can end up split across two batches (batching is by position, not by room): re-group every "Room: description" line across all batches,
        // exactly as the server does within one batch, so the result reads as an unbatched request would have.
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
        const synthController = new AbortController();
        synthAbortRef.current = synthController;
        try {
          const synthesisRes = await fetch("/api/ai/synthesize-descriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ descriptions: successfulDescriptions, context, provider, inspectionId }),
            signal: synthController.signal,
          });
          const synthesisData = await synthesisRes.json();
          if (synthesisRes.ok && synthesisData.description) {
            combined = synthesisData.description;
            synthesisWarnings = Array.isArray(synthesisData.wordingWarnings) ? synthesisData.wordingWarnings.filter((w: unknown): w is string => typeof w === "string") : [];
          } else {
            throw new Error("synthesis failed");
          }
        } catch {
          // The combining step is a polish on top of results that already worked: if it fails, each batch's contribution is labelled honestly rather than lost.
          combined = entries.map(([i, d]) => `[Photos ${i * BATCH_SIZE + 1}–${Math.min((i + 1) * BATCH_SIZE, photoUrls.length)}]\n${d.description}`).join("\n\n");
        } finally {
          setSynthesizing(false);
        }
      }

      if (unmountedRef.current) return; // left during the combining step
      setWordingWarnings([...new Set(synthesisWarnings ?? successful.flatMap((d) => d.warnings))]);
      setComparedWith(Math.max(0, ...successful.map((d) => d.compared)));

      // Notes about the run are shown beside the button, never typed into the person's notes (a "⚠ couldn't analyse" line has no place in a report).
      const truncatedCount = successful.filter((d) => d.truncated).length;
      const noticeLines = [...lines];
      // Detailed could not produce its detailed list for some batches, so those photos got the ordinary description: say so, rather than letting it pass as detailed
      const thin = [...outcome.done.entries()].filter(([, d]) => d.detailPass === "failed").map(([i]) => i);
      if (depth === "detailed" && thin.length > 0) noticeLines.push(`⚠ The detailed step could not be completed for ${photoRanges(thin, BATCH_SIZE, photoUrls.length)}, so those photos have the quicker description (less detail). Analyse them again to try once more.`);
      if (truncatedCount > 0) noticeLines.push(`⚠ ${truncatedCount === 1 ? "One response" : `${truncatedCount} responses`} ran out of space and may be missing details for some items: try analysing fewer photos at once to get complete detail.`);
      setNotices(noticeLines);
      const { cleanText: finalDescription, questions } = parseClarifications(combined);
      setClarifications(questions.map((question) => ({ question, answer: "" })));
      state.inserted = finalDescription;

      if (targetId) {
        const target = document.getElementById(targetId) as HTMLElement | null;
        if (target) {
          const existing = getFieldValue(target).trim();
          // An instruction is replaced by its answer. A finished carry-on run REPLACES the partial text the earlier run left in the notes (so nothing is repeated);
          // otherwise the text is added after what is already there.
          if (isInstruction) setReactControlledValue(target, finalDescription);
          else if (earlierInserted && existing.includes(earlierInserted)) setReactControlledValue(target, existing.replace(earlierInserted, () => finalDescription));
          else setReactControlledValue(target, existing ? `${existing}\n\n${finalDescription}` : finalDescription);
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

  analyzeRef.current = analyze;
  useEffect(() => {
    if (!autoWait) { setSecondsLeft(0); return; }
    const tick = () => {
      const left = Math.ceil((autoWait.until - Date.now()) / 1000);
      if (left <= 0) { setAutoWait(null); setSecondsLeft(0); void analyzeRef.current(true); } else setSecondsLeft(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [autoWait]);

  const applyClarificationAnswers = () => {
    const answered = clarifications.filter((c) => c.answer.trim());
    if (answered.length === 0) return;
    const confirmedText = "Inspector confirmed: " + answered.map((c) => `${c.question} — ${c.answer.trim()}`).join(" ");

    if (targetId) {
      const target = document.getElementById(targetId) as HTMLElement | null;
      if (target) {
        const existing = getFieldValue(target).trim();
        setReactControlledValue(target, existing ? `${existing}\n\n${confirmedText}` : confirmedText);
      }
    } else {
      setResult((prev) => (prev ? `${prev}\n\n${confirmedText}` : confirmedText));
    }

    // Only the answered ones are cleared - an inspector who's still deciding on one question
    // shouldn't lose the ones they already answered by applying what they have so far.
    setClarifications((prev) => prev.filter((c) => !c.answer.trim()));
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
          onClick={() => analyze()}
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
            : remaining && remaining.key === currentKey && remaining.photos > 0
            ? `👁 Analyse the remaining ${remaining.photos} photo${remaining.photos === 1 ? "" : "s"}`
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
        <select
          value={depth}
          onChange={(e) => setDepth(e.target.value as "standard" | "detailed")}
          aria-label="How closely to analyse"
          data-testid="analysis-depth"
          title="Detailed looks closely at every photo with the more capable AI model, lists each item and mark and reads any labels: slower, and costs more. Quick is faster and cheaper but less thorough."
          className="text-xs border border-line rounded-full px-2 py-1 text-slate bg-white"
        >
          <option value="detailed">Detailed (recommended)</option>
          <option value="standard">Quick</option>
        </select>
        {loading && batchProgress && !synthesizing && (
          <button type="button" onClick={() => abortRef.current?.abort()} data-testid="analysis-stop" title="Stop sending photos. What is already analysed is kept." className="text-xs px-2.5 py-1 rounded-full border border-line text-slate hover:border-signal hover:text-signal transition-colors">
            Stop
          </button>
        )}
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
      {autoWait && (
        <div className="mt-1 max-w-md flex items-center gap-2 rounded-lg border border-line bg-paper p-2 text-xs text-ink" data-testid="analysis-autowait">
          <span>Carrying on by itself in <strong data-testid="analysis-countdown">{countdownText(secondsLeft)}</strong>. Keep this page open.</span>
          <button type="button" onClick={() => setAutoWait(null)} data-testid="analysis-autowait-stop" className="rounded-full border border-line px-2 py-0.5 text-slate hover:border-signal">Stop waiting</button>
        </div>
      )}
      {notices.length > 0 && (
        <div role="status" data-testid="analysis-notices" className="mt-1 max-w-md space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          {notices.map((n, i) => <p key={i}>{n}</p>)}
        </div>
      )}
      {comparedWith > 0 && (
        <p className="text-xs text-slate mt-1" data-testid="compared-note">
          Compared with {comparedWith} check-in photo{comparedWith === 1 ? "" : "s"}.
        </p>
      )}
      {wordingWarnings.length > 0 && (
        <p role="status" className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-1 max-w-md">
          ⚠ Check the wording before saving: it may still contain advice or a &quot;not tested&quot; remark ({wordingWarnings.map((w) => `“${w}”`).join(", ")}). An inventory should only record what can be seen.
        </p>
      )}
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
      {hints && (
        <div className="mt-2 max-w-md bg-paper border border-line rounded-lg p-2 space-y-1" data-testid="analysis-hints">
          <p className="text-xs font-medium text-ink">Also noticed (not added to your notes)</p>
          {hints.visibleText.length > 0 && <p className="text-xs text-slate" data-testid="hint-text">Readable text: {hints.visibleText.join(", ")}</p>}
          {hints.safety.length > 0 && <p className="text-xs text-amber-900" data-testid="hint-safety">Safety: {hints.safety.join("; ")}</p>}
          {hints.possible.length > 0 && <p className="text-xs text-slate" data-testid="hint-possible">Possible marks worth a closer look (not stated in your report): {hints.possible.join("; ")}</p>}
          {hints.closerPhotoFor.length > 0 && <p className="text-xs text-slate" data-testid="hint-closer">A closer or clearer photo would show more of: {hints.closerPhotoFor.join("; ")}</p>}
        </div>
      )}
      {clarifications.length > 0 && (
        <div className="mt-2 max-w-md bg-signal/5 border border-signal/30 rounded-lg p-2 space-y-2">
          <p className="text-xs font-medium text-ink">A couple of things worth confirming while you're there:</p>
          {clarifications.map((c, i) => (
            <div key={i}>
              <p className="text-xs text-slate">{c.question}</p>
              <input
                type="text"
                value={c.answer}
                onChange={(e) =>
                  setClarifications((prev) => prev.map((item, idx) => (idx === i ? { ...item, answer: e.target.value } : item)))
                }
                placeholder="Type the answer…"
                className="mt-1 w-full text-xs border border-line rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-signal"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={applyClarificationAnswers}
            disabled={!clarifications.some((c) => c.answer.trim())}
            className="text-xs px-2.5 py-1 rounded-full bg-ink text-white hover:bg-signal transition-colors disabled:opacity-50"
          >
            Add these details
          </button>
        </div>
      )}
    </div>
  );
}
