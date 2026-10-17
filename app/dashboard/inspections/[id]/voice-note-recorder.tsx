"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { appendItemNotes } from "@/lib/actions/inspections";

type InspectionItemRef = { id: string; room: string; itemName: string };
type RoutedComment = { room: string; itemName: string | null; noteText: string; matched: boolean };

export default function VoiceNoteRecorder({ inspectionId, items }: { inspectionId: string; items: InspectionItemRef[] }) {
  const router = useRouter();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [comments, setComments] = useState<RoutedComment[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // If this component unmounts while a recording is still active (navigating away, hitting
  // back) - without this, the only place the microphone gets released is inside
  // recorder.onstop, which never fires unless stopRecording() was explicitly called first.
  // The mic would otherwise stay live and the browser's own mic indicator would stay lit
  // indefinitely, well after the person actually left this page.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const rooms = [...new Set(items.map((i) => i.room))];
  const itemsInRoom = (room: string) => items.filter((i) => i.room === room);

  const startRecording = async () => {
    setError("");
    setTranscript("");
    setComments([]);
    setSaved(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop()); // releases the mic indicator, not just pausing the recorder
        streamRef.current = null; // already stopped - nothing left for the unmount cleanup to do
        handleRecordingComplete();
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch {
      setError("Couldn't access the microphone - please check your browser's permission for this site");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const handleRecordingComplete = async () => {
    const blob = new Blob(chunksRef.current, { type: "audio/webm" });
    if (blob.size === 0) {
      setError("No audio was captured - please try again");
      return;
    }

    setProcessing(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("audio", blob, "voice-note.webm");
      formData.append("inspectionId", inspectionId);
      const res = await fetch("/api/ai/voice-note", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't process that recording");
      setTranscript(data.transcript || "");
      setComments(data.comments || []);
    } catch (err: any) {
      setError(err?.message || "Couldn't process that recording");
    } finally {
      setProcessing(false);
    }
  };

  const updateComment = (index: number, patch: Partial<RoutedComment>) => {
    setComments((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  };

  const removeComment = (index: number) => {
    setComments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setError("");
    try {
      for (const comment of comments) {
        const matchingItem = comment.itemName
          ? items.find((i) => i.room === comment.room && i.itemName === comment.itemName)
          : items.find((i) => i.room === comment.room); // no specific item - attach to the first item in that room as a reasonable place for a general room comment to live
        if (!matchingItem) continue; // genuinely nothing to attach this to - left for the inspector to add manually instead
        await appendItemNotes(matchingItem.id, comment.noteText, inspectionId, false);
      }
      setSaved(true);
      setComments([]);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Couldn't save these notes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-line rounded-xl p-5 mb-6">
      <h3 className="font-display font-600 text-ink">Voice notes</h3>
      <p className="text-sm text-slate mt-1">Talk through what you see, and it'll be transcribed and matched to the right room and item for you to review.</p>

      <div className="mt-4 flex items-center gap-3">
        {!recording ? (
          <button
            onClick={startRecording}
            disabled={processing}
            className="bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
          >
            <span className="w-2 h-2 rounded-full bg-white" /> Start recording
          </button>
        ) : (
          <button onClick={stopRecording} className="bg-red-600 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> Stop recording
          </button>
        )}
        {processing && <span className="text-sm text-slate">Transcribing…</span>}
      </div>

      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {saved && <p className="text-sm text-green-700 mt-3">Notes saved.</p>}

      {transcript && (
        <p className="text-xs text-slate mt-4 italic border-l-2 border-line pl-3">"{transcript}"</p>
      )}

      {comments.length > 0 && (
        <div className="mt-4 space-y-3">
          {comments.map((comment, i) => (
            <div key={i} className={`border rounded-lg p-3 ${comment.matched ? "border-line" : "border-signal bg-signal/5"}`}>
              {!comment.matched && <p className="text-xs text-signal font-medium mb-2">⚠️ Not confident about this match - please check it</p>}
              <div className="flex gap-2 flex-wrap">
                <select
                  value={comment.room}
                  onChange={(e) => updateComment(i, { room: e.target.value, itemName: null })}
                  className="text-xs border border-line rounded-lg px-2 py-1"
                >
                  {rooms.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <select
                  value={comment.itemName || ""}
                  onChange={(e) => updateComment(i, { itemName: e.target.value || null })}
                  className="text-xs border border-line rounded-lg px-2 py-1"
                >
                  <option value="">Whole room</option>
                  {itemsInRoom(comment.room).map((item) => (
                    <option key={item.id} value={item.itemName}>
                      {item.itemName}
                    </option>
                  ))}
                </select>
                <button onClick={() => removeComment(i)} className="text-xs text-red-600 hover:underline ml-auto">
                  Remove
                </button>
              </div>
              <textarea
                value={comment.noteText}
                onChange={(e) => updateComment(i, { noteText: e.target.value })}
                rows={2}
                className="w-full mt-2 border border-line rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
              />
            </div>
          ))}

          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="bg-signal text-white px-5 py-2.5 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save ${comments.length} note${comments.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}
