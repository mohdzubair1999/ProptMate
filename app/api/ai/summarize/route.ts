import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRichText, richTextToPlainText } from "@/lib/richText";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const companyId = (session.user as any).companyId as string | null;

  const { inspectionId, provider: requestedProvider } = await req.json();
  if (!inspectionId) {
    return NextResponse.json({ error: "Missing inspectionId" }, { status: 400 });
  }

  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: companyId || undefined }, deletedAt: null },
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
  if (inspection.status !== "completed") {
    return NextResponse.json({ error: "Mark the inspection complete before generating a summary" }, { status: 400 });
  }

  // Build a compact text representation of everything captured, for the model to summarise
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
            lines.push(`${item.itemName}: ${item.condition}${item.notes ? ` — ${item.notes}` : ""}`);
          }
          continue;
        }
        if (["PHOTO", "SIGNATURE", "PAGE_BREAK", "INFO_TEXT", "TERMS", "GRID_SECTION"].includes(field.type)) continue;
        const rawValue = answerByField.get(field.id) as string | undefined;
        // The Comments field can hold rich-text HTML (bold/italic/bullets from its formatting
        // toolbar) - the model should read it as the plain text a person would see, not raw tags.
        const value = rawValue && isRichText(rawValue) ? richTextToPlainText(rawValue) : rawValue;
        if (value) lines.push(`${field.label}: ${value}`);
      }
      if (lines.length > 0) compiled += `## ${section.title}\n${lines.join("\n")}\n\n`;
    }
  } else {
    for (const item of inspection.items) {
      compiled += `${item.room} — ${item.itemName}: ${item.condition}${item.notes ? ` (${item.notes})` : ""}\n`;
    }
  }

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI writing isn't configured yet — add OPENAI_API_KEY or ANTHROPIC_API_KEY to your environment." },
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
    "You write a short summary for a completed property inspection report, based on the structured data provided. " +
    "Write in plain, direct English - short, simple sentences, one clear idea per sentence, the way an experienced inspector would actually write a report by hand, not dense academic prose with several findings stacked into one long sentence joined by semicolons or 'and'. " +
    "Aim for around 5-8 shorter sentences rather than fewer, longer ones - it's fine for the summary to run a little longer if that's what it takes to keep each sentence simple and readable. " +
    "Stay strictly factual - summarise only what's in the data, never invent findings, causes, or recommendations not present in the source. " +
    "Prioritise anything flagged as urgent, needing action, or a hazard. " +
    "Return only the summary text, no heading, no preamble.";

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
          max_tokens: 1200,
          system: systemPrompt,
          messages: [{ role: "user", content: compiled }],
        }),
      });
      if (!response.ok) {
        console.error("Anthropic error:", await response.text());
        return NextResponse.json({ error: "AI request failed" }, { status: 502 });
      }
      const data = await response.json();
      result = data.content?.[0]?.text?.trim();
      if (data.stop_reason === "max_tokens") {
        console.error(`[summarize] Summary hit the token limit and was cut off (inspection ${inspectionId})`);
        result = result ? `${result}\n\n⚠ This summary was cut off before it finished - please regenerate it.` : result;
      }
    } else if (process.env.OPENAI_API_KEY) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.3,
          max_tokens: 1200,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: compiled },
          ],
        }),
      });
      if (!response.ok) {
        console.error("OpenAI error:", await response.text());
        return NextResponse.json({ error: "AI request failed" }, { status: 502 });
      }
      const data = await response.json();
      result = data.choices?.[0]?.message?.content?.trim();
      if (data.choices?.[0]?.finish_reason === "length") {
        console.error(`[summarize] Summary hit the token limit and was cut off (inspection ${inspectionId})`);
        result = result ? `${result}\n\n⚠ This summary was cut off before it finished - please regenerate it.` : result;
      }
    }

    if (!result) return NextResponse.json({ error: "No response from AI" }, { status: 502 });

    // Persist so it survives a page reload and can be pulled into the PDF
    await prisma.inspection.update({
      where: { id: inspectionId },
      data: { aiSummary: result },
    });

    return NextResponse.json({ summary: result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
