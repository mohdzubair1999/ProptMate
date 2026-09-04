import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Text-only and much lighter than the main vision analysis route, but still allow a bit more
// than the platform default in case the AI response is unusually slow.
export const maxDuration = 30;

// Combines several independently-written descriptions of what's actually the same subject
// (an item split across multiple analysis batches purely by upload position, not by content)
// into one coherent, non-repetitive description. Text-only — no images involved — since each
// input description was already produced by the vision analysis; this step only has to
// reconcile what was already written, not look at anything new.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const descriptions: string[] = Array.isArray(body.descriptions) ? body.descriptions.filter((d: unknown) => typeof d === "string" && d.trim()) : [];
  const { context, provider: requestedProvider, inspectionId } = body;

  // Same eligibility rule as the main analysis route (see analyze-photo/route.ts for the full
  // reasoning) - a check-in/check-out inventory stays a strictly factual condition record,
  // while a mid-term, HMO, legionella, or maintenance inspection allows a brief recommendation.
  // Defaults to no recommendations whenever the type can't be positively confirmed.
  let allowRecommendations = false;
  if (inspectionId) {
    try {
      const inspectionForType = await prisma.inspection.findFirst({
        where: { id: inspectionId, property: { companyId: (session.user as any).companyId || undefined }, deletedAt: null },
        select: { type: true },
      });
      if (inspectionForType && inspectionForType.type !== "check-in" && inspectionForType.type !== "check-out") {
        allowRecommendations = true;
      }
    } catch (err) {
      console.error("Failed to look up inspection type for recommendation eligibility:", err);
    }
  }

  if (descriptions.length === 0) {
    return NextResponse.json({ error: "Missing description(s)" }, { status: 400 });
  }
  // A single description needs no synthesis at all - just hand it straight back rather than
  // spend an AI call reconciling one thing with itself.
  if (descriptions.length === 1) {
    return NextResponse.json({ description: descriptions[0] });
  }

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI analysis isn't configured yet — add OPENAI_API_KEY or ANTHROPIC_API_KEY to your environment." },
      { status: 503 }
    );
  }

  const provider =
    requestedProvider === "anthropic" || requestedProvider === "openai"
      ? requestedProvider
      : process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : "openai";

  const systemPrompt =
    "You help a property inspector document the condition of an item or area, for an inventory/condition report, to speed up their report writing — you are assisting, not replacing their judgement. " +
    "You'll be given several separate descriptions, each independently written by looking at a different subset of photos of the SAME item or area — they were written without seeing each other, so they may repeat the same observation in different words, or each add a genuinely different detail. " +
    "Combine them into ONE single description as if you'd seen all the photos together from the start: state each distinct observation once, merge restatements of the same thing rather than repeating it, and drop nothing genuinely new that any one description mentioned. " +
    "Write as continuous prose in one unbroken paragraph — never use headers, bold section titles, bullet points, or phrases like 'the first description says' or 'combining these' — write it as a single, direct observation, not a summary of summaries. " +
    (allowRecommendations
      ? "Where the input descriptions mention a genuine defect with a recommendation attached, you may keep a brief, practical recommendation in the combined result (e.g. 're-seal recommended', 'requires professional repair') - keep it short and practical, not the main focus of the result. "
      : "IMPORTANT: this is a factual inventory/condition record, not a maintenance recommendation. State only what is observed - never suggest repairs, recommend action, advise what should be done, or use phrasing like 'should be repaired', 'recommend replacing', or 'requires attention', even if an input description already did. ") +
    "IMPORTANT: never omit a real, distinct issue just to keep the result short — the right length depends entirely on how much genuinely distinct content is actually in the input descriptions. If they're all just repeating the same one or two points, the combined result should genuinely be that short. If between them they cover several real, different issues, the combined result should cover every one of them, however long that ends up being. Don't pad or invent detail to sound thorough, but a result that quietly drops something real is worse than one that runs a bit longer.";

  const userPrompt =
    (context ? `Context: ${context}\n\n` : "") +
    `Here are ${descriptions.length} separately-written descriptions of the same item/area:\n\n` +
    descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n\n");

  try {
    let result: string | undefined;

    if (provider === "anthropic" && process.env.ANTHROPIC_API_KEY) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
      if (!response.ok) {
        console.error("Anthropic synthesis error:", await response.text());
        return NextResponse.json({ error: "AI synthesis failed" }, { status: 502 });
      }
      const data = await response.json();
      result = data.content?.[0]?.text?.trim();
      if (data.stop_reason === "max_tokens") {
        console.error(`[synthesize-descriptions] Response hit the token limit and was cut off (${descriptions.length} input description(s))`);
      }
    } else if (process.env.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (!response.ok) {
        console.error("OpenAI synthesis error:", await response.text());
        return NextResponse.json({ error: "AI synthesis failed" }, { status: 502 });
      }
      const data = await response.json();
      result = data.choices?.[0]?.message?.content?.trim();
      if (data.choices?.[0]?.finish_reason === "length") {
        console.error(`[synthesize-descriptions] Response hit the token limit and was cut off (${descriptions.length} input description(s))`);
      }
    }

    if (!result) return NextResponse.json({ error: "No response from AI" }, { status: 502 });

    return NextResponse.json({ description: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI synthesis failed" }, { status: 500 });
  }
}
