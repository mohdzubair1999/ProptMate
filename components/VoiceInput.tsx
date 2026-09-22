"use client";

import { setReactControlledValue } from "@/lib/reactInputHelper";
import { useEffect, useRef, useState } from "react";

// Voice dictation button — attaches to any textarea/input by id, using the browser's
// built-in Web Speech API (no external service, no API key, no per-use cost).
// Supported in Chrome, Edge, and Safari. Not supported in Firefox — the button hides
// itself there rather than showing a broken control.
export default function VoiceInput({ targetId }: { targetId: string }) {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-GB";

    recognition.onresult = (event: any) => {
      const target = document.getElementById(targetId) as HTMLTextAreaElement | HTMLInputElement | null;
      if (!target) return;

      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }

      if (transcript.trim()) {
        const existing = target.value.trim();
        setReactControlledValue(target, existing ? `${existing} ${transcript.trim()}` : transcript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed") {
        setError("Microphone access denied — check your browser permissions");
      } else if (event.error !== "no-speech") {
        setError("Voice input stopped — try again");
      }
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [targetId]);

  const toggle = () => {
    if (!recognitionRef.current) return;
    setError("");

    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  };

  if (!supported) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1.5 ${
          listening ? "border-signal bg-signal/10 text-signal" : "border-line text-slate hover:text-ink hover:border-ink"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${listening ? "bg-signal animate-pulse" : "bg-slate"}`} />
        {listening ? "Listening… tap to stop" : "🎙 Dictate"}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
