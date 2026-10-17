import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "AI writing isn't configured yet — add OPENAI_API_KEY or ANTHROPIC_API_KEY to your environment." },
      { status: 503 }
    );
  }

  const { text, context, provider: requestedProvider, style } = await req.json();

  if (!text || !text.trim()) {
    return NextResponse.json({ error: "Nothing to polish" }, { status: 400 });
  }

  const provider =
    requestedProvider === "anthropic" || requestedProvider === "openai"
      ? requestedProvider
      : process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : "openai";

  const systemPrompt =
    style === "short-phrase"
      ? "You clean up a short field entry for a formal property inspection report — fixing typos, casing, and abbreviations only. " +
        "Keep it to a few words, matching the original length roughly. Never add detail that wasn't in the original. " +
        "Return only the cleaned text, no quotes, no explanation."
      : "You rewrite a property inspector's rough field notes into a single, concise, professional sentence or two for a formal inspection report. " +
        "Stay strictly factual — never add details, causes, or conclusions that aren't in the original note. " +
        "Use neutral, report-appropriate language (e.g. 'a hairline crack was observed' rather than casual phrasing). " +
        "Return only the rewritten text, with no quotation marks, preamble, or explanation.";

  const userPrompt = `Context: ${context || "General inspection note"}\nRough note: ${text}`;

  try {
    if (provider === "anthropic") {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json({ error: "ANTHROPIC_API_KEY isn't set" }, { status: 503 });
      }

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Anthropic error:", errText);
        return NextResponse.json({ error: "AI request failed" }, { status: 502 });
      }

      const data = await response.json();
      const result = data.content?.[0]?.text?.trim();

      if (!result) return NextResponse.json({ error: "No response from AI" }, { status: 502 });
      return NextResponse.json({ result });
    }

    // OpenAI
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY isn't set" }, { status: 503 });
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
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
      const errText = await response.text();
      console.error("OpenAI error:", errText);
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim();

    if (!result) return NextResponse.json({ error: "No response from AI" }, { status: 502 });
    return NextResponse.json({ result });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
