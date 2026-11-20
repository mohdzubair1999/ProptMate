import { recordAiUsage } from "@/lib/aiUsage";
import { languageFor } from "@/lib/translateReport";
import { scopeCompanyId } from "@/lib/access";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { aiFetch } from "@/lib/aiHttp";
import { callVisionTool, pickProvider } from "@/lib/ai/vision";
import { WALKTHROUGH_SCHEMA, WALKTHROUGH_SYSTEM, normaliseWalkthrough } from "@/lib/ai/walkthrough";

export const maxDuration = 60;
const aiCall = (url: string, init: RequestInit) => aiFetch(url, init, { label: "Walk-through", budgetMs: 25000 });

// The inspector talks through ONE room; this returns the item list it describes for them to check and add. Nothing is saved here.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Your account isn't linked to a company yet." }, { status: 403 });
  const limit = await checkRateLimit(`walkthrough:${session.user.id}`, 40, 15);
  if (!limit.allowed) return NextResponse.json({ error: "Too many walk-throughs recently - please wait a few minutes" }, { status: 429 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "Voice transcription isn't configured yet - add OPENAI_API_KEY to your environment." }, { status: 500 });
  const provider = pickProvider(undefined);
  if (!provider) return NextResponse.json({ error: "AI analysis isn't set up yet" }, { status: 503 });

  const formData = await req.formData();
  const audio = formData.get("audio") as File | null;
  const inspectionId = String(formData.get("inspectionId") || "");
  const room = String(formData.get("room") || "").trim().slice(0, 80);
  if (!audio || audio.size === 0) return NextResponse.json({ error: "No recording was provided" }, { status: 400 });
  if (!inspectionId || !room) return NextResponse.json({ error: "Choose a room first" }, { status: 400 });
  if (audio.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Recording is too long - please do one room at a time" }, { status: 400 });

  const inspection = await prisma.inspection.findFirst({ where: { id: inspectionId, property: { companyId: scopeCompanyId(companyId) }, deletedAt: null }, select: { id: true, status: true } });
  if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (inspection.status !== "draft") return NextResponse.json({ error: "This inspection is already completed" }, { status: 400 });
  await recordAiUsage(companyId, "walkthrough");

  const existing = await prisma.inspectionItem.findMany({ where: { inspectionId, room: { equals: room, mode: "insensitive" } }, select: { itemName: true } });

  const spoken = String(formData.get("spokenLanguage") || "en");
  const speaksOther = spoken !== "en" && languageFor(spoken) !== null;
  const w = new FormData();
  w.append("file", audio, audio.name || "recording.webm");
  w.append("model", "whisper-1");
  if (!speaksOther) w.append("language", "en");
  const whisper = await aiCall(speaksOther ? "https://api.openai.com/v1/audio/translations" : "https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: w });
  if (!whisper.ok) { console.error("Walk-through transcription failed:", whisper.status); return NextResponse.json({ error: "Couldn't transcribe that recording - please try again" }, { status: 502 }); }
  const transcript: string = ((await whisper.json()) as any).text || "";
  if (!transcript.trim()) return NextResponse.json({ transcript: "", items: [] });

  const result = await callVisionTool({
    provider, depth: "standard", system: WALKTHROUGH_SYSTEM, toolName: "record_items", toolDescription: "Record the inventory items the inspector described for this room.", schema: WALKTHROUGH_SCHEMA, maxTokens: 2500,
    parts: [{ type: "text", text: `Room: ${room}\nItems already on this room's list (do not repeat): ${existing.map((e: { itemName: string }) => e.itemName).join(", ") || "none"}\n\nWhat the inspector said:\n"${transcript.slice(0, 6000)}"` }],
  });
  if (!result.ok) return NextResponse.json({ error: result.error, transcript }, { status: result.status });
  return NextResponse.json({ transcript, items: normaliseWalkthrough(result.data as any, existing.map((e: { itemName: string }) => e.itemName)) });
}
