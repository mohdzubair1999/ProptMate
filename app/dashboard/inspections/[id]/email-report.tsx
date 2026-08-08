"use client";

import { useState } from "react";

export default function EmailReportForm({ inspectionId }: { inspectionId: string }) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setStatus("idle");
    setErrorMsg("");

    try {
      const res = await fetch("/api/email/send-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inspectionId, recipientEmail: email, message }),
      });
      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong");
        return;
      }

      setStatus("sent");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={send} className="mt-4 flex flex-col gap-2 max-w-sm">
      <input
        type="email"
        required
        placeholder="recipient@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />
      <input
        type="text"
        placeholder="Optional message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        className="border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
      />
      <button
        type="submit"
        disabled={sending}
        className="bg-ink text-white px-4 py-2 rounded-full text-sm font-medium hover:bg-signal transition-colors disabled:opacity-50 w-fit"
      >
        {sending ? "Sending…" : "📧 Email report"}
      </button>
      {status === "sent" && <p className="text-xs text-verified">Sent successfully.</p>}
      {status === "error" && <p className="text-xs text-red-600">{errorMsg}</p>}
    </form>
  );
}
