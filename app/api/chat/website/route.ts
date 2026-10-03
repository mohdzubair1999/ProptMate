import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isIpBlocked, logSecurityEvent } from "@/lib/security";
import { WEBSITE_CHAT_SYSTEM_PROMPT } from "@/lib/websiteChatKnowledge";

export const maxDuration = 30;

type ChatMessage = { role: "user" | "assistant"; content: string };

// Caps on the conversation payload itself - a genuine back-and-forth with a website visitor
// never needs more than this, and without a cap, a single request could be used to send an
// arbitrarily large, expensive payload straight to the API on this app's own bill.
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 2000;

export async function POST(req: Request) {
  const clientIp = getClientIp(req);

  if (await isIpBlocked(clientIp)) {
    return NextResponse.json({ error: "Unable to process this request" }, { status: 403 });
  }

  const rateLimit = await checkRateLimit(`website-chat:${clientIp}`, 20, 15);
  if (!rateLimit.allowed) {
    await logSecurityEvent("rate_limit_exceeded", "low", clientIp, "chat/website", "Exceeded 20 chat messages in 15 minutes");
    return NextResponse.json({ error: "You've sent a lot of messages recently - please wait a few minutes and try again" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Chat isn't configured yet" }, { status: 500 });
  }

  const body = await req.json();
  const messages = body.messages as ChatMessage[] | undefined;

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "No message provided" }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "This conversation has gotten quite long - please start a new one" }, { status: 400 });
  }
  for (const m of messages) {
    if (typeof m.content !== "string" || m.content.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: "A message is too long" }, { status: 400 });
    }
    if (m.role !== "user" && m.role !== "assistant") {
      return NextResponse.json({ error: "Invalid message" }, { status: 400 });
    }
  }

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system: WEBSITE_CHAT_SYSTEM_PROMPT,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => "");
    console.error("Website chat failed:", aiRes.status, errText);
    return NextResponse.json({ error: "Something went wrong - please try again in a moment" }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const reply: string = aiData.content?.[0]?.text || "Sorry, I couldn't come up with a reply to that - could you try rephrasing?";

  return NextResponse.json({ reply });
}
