import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";

export const maxDuration = 60;

type RoutedComment = {
  room: string;
  itemName: string | null; // null when the comment is genuinely about the room in general, not one specific item
  noteText: string;
  matched: boolean; // false when no confident match was found against this inspection's real items - left for the inspector to route manually rather than guessed
};

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  // Rate limited by the authenticated user's own ID, not IP - this endpoint requires login,
  // so a per-user limit is more accurate than per-IP, which could unfairly throttle multiple
  // inspectors sharing the same office network.
  const rateLimit = await checkRateLimit(`voice-note:${session.user.id}`, 30, 15);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many voice notes recently - please wait a few minutes" }, { status: 429 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "Voice transcription isn't configured yet - add OPENAI_API_KEY to your environment." }, { status: 500 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Voice note routing isn't configured yet - add ANTHROPIC_API_KEY to your environment." }, { status: 500 });
  }

  const formData = await req.formData();
  const audio = formData.get("audio") as File | null;
  const inspectionId = formData.get("inspectionId") as string | null;

  if (!audio || audio.size === 0) return NextResponse.json({ error: "No recording was provided" }, { status: 400 });
  if (!inspectionId) return NextResponse.json({ error: "Missing inspectionId" }, { status: 400 });
  // A voice note recording a whole room walkthrough is naturally longer than an inventory
  // photo, but still needs a real ceiling - this comfortably covers several minutes of
  // continuous speech while still catching an accidental huge or wrong file.
  if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Recording is too long - please keep voice notes under a few minutes" }, { status: 400 });

  const companyId = (session.user as any).companyId as string | null;
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
    select: { id: true },
  });
  if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

  // Only this inspection's OWN, actual items - the routing step below is only ever allowed
  // to match against rooms/items that genuinely exist here, never invent a plausible-sounding
  // one that isn't actually part of this inspection.
  const existingItems = await prisma.inspectionItem.findMany({
    where: { inspectionId },
    select: { room: true, itemName: true },
  });
  const roomList = [...new Set(existingItems.map((i) => i.room))];
  const itemsByRoom = existingItems.reduce<Record<string, string[]>>((acc, i) => {
    (acc[i.room] ||= []).push(i.itemName);
    return acc;
  }, {});

  // Step 1: transcribe the actual audio via Whisper.
  const whisperFormData = new FormData();
  whisperFormData.append("file", audio, audio.name || "recording.webm");
  whisperFormData.append("model", "whisper-1");
  whisperFormData.append("language", "en"); // this app is UK-focused - an explicit hint avoids
  // auto-detection misfiring on a short or noisy clip and transcribing in the wrong language
  // entirely, rather than just imperfectly in English

  const whisperRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: whisperFormData,
  });

  if (!whisperRes.ok) {
    const errText = await whisperRes.text().catch(() => "");
    console.error("Whisper transcription failed:", whisperRes.status, errText);
    return NextResponse.json({ error: "Couldn't transcribe that recording - please try again" }, { status: 502 });
  }

  const whisperData = await whisperRes.json();
  const transcript: string = whisperData.text || "";

  if (!transcript.trim()) {
    return NextResponse.json({ transcript: "", comments: [] });
  }

  // Step 2: split the transcript into distinct comments and route each one against this
  // inspection's real room/item list.
  const systemPrompt =
    "You help a property inspector who has just spoken a voice note while walking through a property, describing what they see room by room. " +
    "Split their transcript into distinct comments - each comment is one genuinely separate observation, which might be about a whole room in general or about one specific item within it. A single sentence can be one comment; a longer, rambling passage covering several different things should be split into as many comments as it genuinely covers. " +
    "Return ONLY a JSON array, no other text: " +
    '[{"room": string, "itemName": string | null, "noteText": string, "matched": boolean}]. ' +
    "For each comment, try to match it to one of this inspection's ACTUAL rooms and items, listed below - never invent a room or item name that isn't in this list. " +
    "If the comment is clearly about one specific listed item, set itemName to that item's exact name and matched to true. If it's about the room in general rather than one item, set itemName to null and matched to true. " +
    "If you genuinely can't tell which of the listed rooms this comment belongs to, make your best guess at the room but set matched to false, so the inspector can correct it themselves rather than have a wrong guess silently accepted. " +
    "noteText should be the actual observation, written as a clean, complete sentence - correct for obvious transcription errors and filler words (um, so, like), but never add any detail, judgement, or recommendation the inspector didn't actually say. " +
    "\n\nThis inspection's actual rooms and items:\n" +
    roomList.map((room) => `- ${room}: ${(itemsByRoom[room] || []).join(", ") || "(no items recorded yet)"}`).join("\n");

  const routingRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: `Transcript: "${transcript}"` }],
    }),
  });

  if (!routingRes.ok) {
    const errText = await routingRes.text().catch(() => "");
    console.error("Voice note routing failed:", routingRes.status, errText);
    // The transcript itself is still genuinely useful even if routing failed - returned as a
    // single, unmatched comment rather than failing the whole request over a step that isn't
    // the actual, hard-to-redo part (the transcription).
    return NextResponse.json({ transcript, comments: [{ room: roomList[0] || "", itemName: null, noteText: transcript, matched: false }] });
  }

  const routingData = await routingRes.json();
  const responseText: string = routingData.content?.[0]?.text || "[]";

  let comments: RoutedComment[];
  try {
    const cleaned = responseText.replace(/^```json\s*|\s*```$/g, "").trim();
    comments = JSON.parse(cleaned);
    if (!Array.isArray(comments)) throw new Error("Not an array");
  } catch {
    // Same reasoning as above - a parsing failure on the routing step shouldn't discard the
    // transcript itself, which is still directly useful to the inspector as-is.
    comments = [{ room: roomList[0] || "", itemName: null, noteText: transcript, matched: false }];
  }

  return NextResponse.json({ transcript, comments });
}
