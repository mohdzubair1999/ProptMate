"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";

type Message = { role: "user" | "assistant"; content: string };

export default function WebsiteChatWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, open]);

  // Only on the public marketing site - not inside the dashboard or the tenant/landlord
  // portal, which are separate, logged-in experiences this first version isn't built for.
  if (pathname.startsWith("/dashboard") || pathname.startsWith("/portal")) return null;

  const handleNewChat = () => {
    setMessages([]);
    setError("");
    setInput("");
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/chat/website", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
    } catch (err: any) {
      setError(err?.message || "Something went wrong - please try again");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {open ? (
        <div className="fixed bottom-6 right-6 w-[min(360px,calc(100vw-3rem))] h-[min(500px,calc(100vh-6rem))] bg-white border border-line rounded-2xl shadow-xl flex flex-col z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <p className="font-display font-600 text-ink">Chat with us</p>
            <div className="flex items-center gap-3">
              {messages.length > 0 && (
                <button onClick={handleNewChat} className="text-xs text-slate hover:text-ink">
                  New chat
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-slate hover:text-ink text-sm">
                ✕
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <p className="text-sm text-slate">Ask me anything about ProptMate - what it does, how it works, or what fits your team.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`text-sm ${m.role === "user" ? "text-right" : "text-left"}`}>
                <span
                  className={`inline-block px-3 py-2 rounded-2xl max-w-[85%] text-left ${
                    m.role === "user" ? "bg-signal text-white" : "bg-paper text-ink"
                  }`}
                >
                  {m.content}
                </span>
              </div>
            ))}
            {sending && <p className="text-xs text-slate">Typing…</p>}
            {error && (
              <div className="text-xs text-red-600">
                <p>{error}</p>
                {error.includes("gotten quite long") && (
                  <button onClick={handleNewChat} className="mt-1 underline hover:no-underline">
                    Start a new conversation
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-line flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message…"
              className="flex-1 border border-line rounded-full px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-signal"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="bg-signal text-white px-4 py-2 rounded-full text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 bg-signal text-white px-5 py-3 rounded-full font-medium shadow-lg hover:opacity-90 transition-opacity z-50"
        >
          Chat with us
        </button>
      )}
    </>
  );
}
