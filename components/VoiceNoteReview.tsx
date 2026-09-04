"use client";

import { setReactControlledValue } from "@/lib/reactInputHelper";
import { useEffect, useRef, useState } from "react";

// Records live (same free browser Speech API as the Dictate button), but instead of writing
// straight into the field as you talk, it holds the transcript in an editable preview first —
// so a mumbled word or interruption can be fixed or the whole thing discarded before it ever
// touches the actual field.
export default function VoiceNoteReview({ targetId }: { targetId: string }) {
  const [supported, setSupported] = useState(true);
  const [recording, setRecording] = useState(false);
  const [draft, setDraft] = useState<string | null>(null); // null = no draft yet, string = reviewing
  const [error, setError] = useState("");
  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef("");
  const interimRef = useRef("");

  // Feature detection only — deliberately doesn't construct or hold onto a SpeechRecognition
  // instance here, since a fresh one gets built on every actual recording start instead (see
  // buildRecognition below).
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) setSupported(false);
  }, []);

  const buildRecognition = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Safari's speech recognition can go a long time (several
    // seconds, several words) before ever firing a "final" result — tracking interim results too
    // means nothing gets lost if the person stops recording before that final event arrives.
    recognition.lang = "en-GB";

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        else interimText += event.results[i][0].transcript;
      }
      if (finalText.trim()) {
        transcriptRef.current = transcriptRef.current ? `${transcriptRef.current} ${finalText.trim()}` : finalText.trim();
        interimRef.current = ""; // this bit is now confirmed final, clear the pending interim copy
      } else if (interimText.trim()) {
        interimRef.current = interimText.trim();
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") setError("Microphone access denied — check your browser permissions");
      else if (event.error !== "no-speech") setError("Recording stopped — try again");
      setRecording(false);
    };

    recognition.onend = () => setRecording(false);

    return recognition;
  };

  const startRecording = () => {
    // A fresh instance every time, rather than reusing one — browsers can silently fail to
    // restart the same SpeechRecognition object after it's already fired 'end' once.
    const recognition = buildRecognition();
    if (!recognition) return;

    setError("");
    setDraft(null);
    transcriptRef.current = "";
    interimRef.current = "";
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
    // Prefer the confirmed-final transcript, but fall back to whatever interim text came
    // through if a final result never actually fired.
    const result = transcriptRef.current || interimRef.current;
    setDraft(result || "(nothing was picked up — try again)");
  };

  const useTranscript = () => {
    const target = document.getElementById(targetId) as HTMLTextAreaElement | HTMLInputElement | null;
    if (target && draft) {
      const existing = target.value.trim();
      setReactControlledValue(target, existing ? `${existing} ${draft.trim()}` : draft.trim());
    }
    setDraft(null);
  };

  if (!supported) return null;

  // Reviewing a completed recording
  if (draft !== null) {
    return (
      <div className="border border-line rounded-lg p-3 bg-paper">
        <p className="text-xs text-slate mb-1.5">Review before adding — edit anything that came out wrong:</p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
        />
        <div className="flex items-center gap-2 mt-2">
          <button type="button" onClick={useTranscript} className="text-xs px-3 py-1.5 rounded-full bg-signal text-white hover:opacity-90 transition-opacity">
            ✓ Use this
          </button>
          <button type="button" onClick={startRecording} className="text-xs px-3 py-1.5 rounded-full border border-line text-slate hover:text-ink hover:border-ink transition-colors">
            Record again
          </button>
          <button type="button" onClick={() => setDraft(null)} className="text-xs text-slate hover:text-ink">
            Discard
          </button>
        </div>
      </div>
    );
  }

  // Idle or actively recording
  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={recording ? stopRecording : startRecording}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${
          recording ? "border-signal bg-signal/10 text-signal" : "border-line text-slate hover:text-ink hover:border-ink"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${recording ? "bg-signal animate-pulse" : "bg-slate"}`} />
        {recording ? "Recording… tap to stop" : "🎙 Record voice note"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
