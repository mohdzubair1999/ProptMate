import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// Reads an externally-sourced check-in report (from a different agency, not created in
// ProptMate) and does two things: (1) produces a plain-language, room-by-room summary for
// the person to read and cross-check against the original document themselves, and (2)
// attempts to map any clearly-matching data onto this specific checkout's own template
// fields, so it can be compared field-by-field. Mapping is deliberately conservative — a
// field is only filled when the report genuinely states that value, never inferred or
// guessed, since an incorrect AI-filled field would look authoritative while actually being
// wrong, which is worse than leaving it blank for the person to fill in themselves.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const fieldsJson = formData.get("fields") as string | null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!fieldsJson) {
    return NextResponse.json({ error: "No template fields provided" }, { status: 400 });
  }

  let fields: { id: string; sectionTitle: string; label: string; type: string; options?: string }[];
  try {
    fields = JSON.parse(fieldsJson);
  } catch {
    return NextResponse.json({ error: "Invalid template fields" }, { status: 400 });
  }

  const MAX_SIZE = 20 * 1024 * 1024; // 20MB — comfortably under Anthropic's per-file limits
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File is too large (max 20MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  // Each field is described with its exact valid value format, since the model must
  // produce values that are genuinely usable by the app, not just plausible-looking text —
  // a dropdown value that doesn't exactly match one of its options is worse than useless,
  // since it would silently fail to display as selected anywhere.
  const fieldDescriptions = fields
    .map((f) => {
      let formatNote = "";
      if (f.type === "YES_NO") formatNote = ' — value must be exactly "Yes", "No", or "N/A"';
      else if (f.type === "SCORE") formatNote = ' — value must be exactly "1", "2", "3", "4", or "5"';
      else if (f.type === "DATE") formatNote = " — value must be YYYY-MM-DD";
      else if (f.type === "NUMBER") formatNote = " — value must be a plain number";
      else if ((f.type === "DROPDOWN" || f.type === "MULTIPLE_CHOICE") && f.options) {
        try {
          const opts = JSON.parse(f.options);
          if (Array.isArray(opts)) formatNote = ` — value must exactly match one of: ${opts.join(", ")}`;
        } catch {}
      }
      return `- id="${f.id}" | section="${f.sectionTitle}" | label="${f.label}" | type=${f.type}${formatNote}`;
    })
    .join("\n");

  const systemPrompt =
    "You read an externally-sourced property check-in report (from a different agency or inspector, not created in this app) and produce two things for someone preparing a check-out inspection. " +
    "First, a plain-language summary per room describing the condition noted at check-in — this is what the person will actually read and rely on, so it should be genuinely useful and specific (e.g. 'Carpet worn near the door, small scuff on the west wall, curtains in good condition' rather than vague statements). " +
    "When a room in the report clearly corresponds to one of the template sections listed below, use that section's EXACT name (character for character) as the room name — do not invent a combined or parenthesized name like 'Lounge (Reception room)'; just use 'Reception room' plainly. Only use a name of your own when the room genuinely has no equivalent section in the template. " +
    "Second, an attempt to map data from the report onto this checkout's own specific template fields, listed below. " +
    "CRITICAL: only include a field mapping when the report clearly and specifically states that value — never infer, estimate, or guess a plausible value. If the report doesn't address a field at all, or is ambiguous, leave it out entirely rather than fill in your best guess. " +
    "Each field has an exact required value format — follow it precisely, character for character, or the mapping will be rejected by the app. " +
    "Set confidence to \"low\" for any mapping where the report's wording only loosely or indirectly suggests the value, so the person reviewing knows to double-check it specifically; use \"high\" only when the report states it plainly and unambiguously. " +
    "Respond with ONLY a JSON object, no other text, in exactly this shape: " +
    '{"roomSummaries": [{"room": "string", "summary": "string"}], "mappings": [{"fieldId": "string (must be one of the ids listed below)", "value": "string in the exact required format", "confidence": "high or low"}]}. ' +
    "Template fields available to map onto:\n" +
    fieldDescriptions;

  const userPrompt = "Extract the room-by-room summary and map any clearly-stated data onto the template fields as instructed.";

  try {
    let content: any[];
    if (isPdf) {
      content = [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
        { type: "text", text: userPrompt },
      ];
    } else {
      content = [
        { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
        { type: "text", text: userPrompt },
      ];
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        // A large template's extended thinking alone can consume several thousand tokens
        // before the model even begins the actual answer (confirmed from a real response
        // that hit the old 4000 limit with 3999 spent purely on thinking) — this gives
        // genuine headroom for both the thinking and a substantial field-mapping response.
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", errText);
      return NextResponse.json({ error: "Couldn't read the document" }, { status: 502 });
    }

    const data = await res.json();
    // Looks for the text block by type rather than assuming a fixed position — the model
    // can return a "thinking" block before the actual answer, which would otherwise
    // silently produce no usable text if content[0] were assumed to always be it.
    const textBlock = Array.isArray(data.content) ? data.content.find((c: any) => c?.type === "text") : undefined;
    const rawText: string | undefined = textBlock?.text?.trim();
    if (!rawText) {
      console.error("Anthropic response had no usable text:", JSON.stringify(data));
      return NextResponse.json({ error: "No response from AI" }, { status: 502 });
    }

    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch {
      return NextResponse.json({ error: "Couldn't parse the extracted data" }, { status: 502 });
    }

    return NextResponse.json({ extracted });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Something went wrong reading the document" }, { status: 500 });
  }
}
