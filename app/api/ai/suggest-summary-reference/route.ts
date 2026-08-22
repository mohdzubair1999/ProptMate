import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Deliberately excluded from what the AI is asked to suggest: meter serial numbers and
// readings (precise numbers — a wrong one could cause a real billing dispute, and nothing in
// room-by-room notes would reliably contain these anyway), and key location (purely
// logistical, never something room photos or condition notes would indicate). These stay
// entirely manual, always.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const companyId = (session.user as any).companyId as string | null;

  const { inspectionId } = await req.json();
  if (!inspectionId) {
    return NextResponse.json({ error: "Missing inspectionId" }, { status: 400 });
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined } },
    include: {
      property: true,
      items: true,
      template: { include: { sections: { include: { fields: true } } } },
      answers: true,
    },
  });

  if (!inspection) {
    return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  }

  // Same "compile everything into readable text" approach as the existing AI Summary
  // endpoint, so both features stay consistent rather than diverging into two different
  // data-shaping strategies for the same underlying inspection.
  let compiled = `Property: ${inspection.property.address} (${inspection.property.type})\nInspection type: ${inspection.type}\n\n`;

  if (inspection.template) {
    const answerByField = new Map(inspection.answers.map((a) => [a.fieldId, a.value]));
    const itemsByField = new Map<string, typeof inspection.items>();
    for (const item of inspection.items) {
      if (!item.templateFieldId) continue;
      const list = itemsByField.get(item.templateFieldId) || [];
      list.push(item);
      itemsByField.set(item.templateFieldId, list);
    }

    for (const section of inspection.template.sections) {
      const lines: string[] = [];
      for (const field of section.fields) {
        if (field.type === "INVENTORY_SECTION") {
          const items = itemsByField.get(field.id) || [];
          for (const item of items) {
            lines.push(`${item.itemName} (${item.room}): ${item.condition}${item.notes ? ` — ${item.notes}` : ""}`);
          }
          continue;
        }
        if (["PHOTO", "SIGNATURE", "PAGE_BREAK", "INFO_TEXT", "TERMS", "GRID_SECTION"].includes(field.type)) continue;
        const value = answerByField.get(field.id);
        if (value) lines.push(`${field.label}: ${value}`);
      }
      if (lines.length > 0) compiled += `## ${section.title}\n${lines.join("\n")}\n\n`;
    }
  } else {
    for (const item of inspection.items) {
      compiled += `${item.room} — ${item.itemName}: ${item.condition}${item.notes ? ` (${item.notes})` : ""}\n`;
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI writing isn't configured yet — add ANTHROPIC_API_KEY to your environment." }, { status: 503 });
  }

  const systemPrompt =
    "You are helping fill in a property inspection report's summary section, based on the room-by-room inspection data provided. " +
    "Return ONLY a JSON object with these exact keys: propertyDescription, otherAlarmLocation, otherAlarmTested, boilerLocation, stopcockLocation, fuseBoxLocation. " +
    "For propertyDescription: write a brief (1-2 sentence) factual summary based strictly on what's actually in the data — never invent findings not present in the source. " +
    "For the location fields (otherAlarmLocation, boilerLocation, stopcockLocation, fuseBoxLocation): " +
    "only fill these in if that specific item was actually recorded as an inventory item with an identifiable room — use that room name as the value. " +
    "For otherAlarmTested: only fill in if explicitly recorded, using the exact value found (e.g. Yes/No/Working). " +
    "If an item wasn't recorded anywhere in the data, leave that field as an empty string — never guess a location or status. " +
    "Do not include any keys other than the ones listed. Return only the JSON object, no other text.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: "user", content: compiled }],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic error:", await response.text());
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    const data = await response.json();
    const rawText: string | undefined = data.content?.[0]?.text?.trim();
    if (!rawText) return NextResponse.json({ error: "No response from AI" }, { status: 502 });

    // The model is instructed to return only JSON, but strip markdown code fences
    // defensively in case it wraps the response in ```json anyway.
    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    let suggestions: Record<string, string>;
    try {
      suggestions = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI suggestion response:", rawText);
      return NextResponse.json({ error: "AI returned an unexpected format — please try again." }, { status: 502 });
    }

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
