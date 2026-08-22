import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import sharp from "sharp";

// Generous but bounded — a hand-drawn sketch photographed on a phone can be large, and this
// endpoint only needs to run once per upload, not repeatedly like the photo-analysis route.
export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "AI floor plan generation isn't configured yet — add ANTHROPIC_API_KEY to your environment." }, { status: 503 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "That image is too large — please upload something under 15MB." }, { status: 400 });
  }

  let base64: string;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const resized = await sharp(buffer)
      .rotate() // respect EXIF orientation, since this is very likely a phone photo of a paper sketch
      .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    base64 = resized.toString("base64");
  } catch (err) {
    console.error("Couldn't process uploaded sketch:", err);
    return NextResponse.json({ error: "Couldn't read that image — please try a different file." }, { status: 400 });
  }

  // Deliberately honest about what's actually extractable from a hand-drawn sketch: room
  // layout, approximate shape, and which rooms visually connect are genuinely readable from
  // a drawing. Precise real-world dimensions are not, unless the person actually wrote
  // measurements on the sketch — the model is instructed not to fabricate false precision.
  const systemPrompt =
    "You analyse a hand-drawn or sketched floor plan image and convert it into structured room data for a floor plan tool. " +
    "Look at the rooms drawn, their approximate relative sizes and positions, their rough shape, and which rooms appear connected by a door or opening (rooms drawn touching or with a door marked between them). " +
    "Return ONLY a JSON object with this exact structure, no other text: " +
    '{"rooms": [{"name": string, "widthM": number, "lengthM": number, "shape": "rectangle" | "bay-window" | "l-shape", "bayWidthM": number | null, "bayDepthM": number | null, "notchWidthM": number | null, "notchDepthM": number | null, "connectsTo": string[]}], "dimensionsFromSketch": boolean}. ' +
    "For each room's name: use a label actually written on the sketch if present, otherwise a reasonable generic name (Bedroom, Kitchen, Bathroom, Living room, Hallway, etc), numbering duplicates (Bedroom 1, Bedroom 2). " +
    "For widthM/lengthM: if the sketch has actual measurements written on it (numbers, dimension lines, or labels like '3.5m' or '12ft'), use those, converting feet to metres if needed, and set dimensionsFromSketch to true. " +
    "If no measurements are written anywhere on the sketch, dimensionsFromSketch must be false, and you should estimate each room's size using typical UK residential proportions for that room type (e.g. a bedroom is usually larger than a bathroom), scaled so the rooms' RELATIVE sizes roughly match what's drawn — a room drawn twice as large as another should be roughly twice the floor area. Never invent a false impression of precision when you're actually estimating. " +
    "For shape: use 'rectangle' unless the room is clearly drawn with a distinct L-shaped notch (use 'l-shape' with notchWidthM/notchDepthM estimated from the drawing) or a window bay protruding from one wall (use 'bay-window' with bayWidthM/bayDepthM estimated from the drawing). Leave the unused shape-specific fields as null. " +
    "For connectsTo: list the exact names of other rooms in your own output that this room appears to have a door or opening to, based on the sketch — walls drawn without any gap or door mark mean no connection. " +
    "Order the rooms array left-to-right, top-to-bottom roughly matching the sketch's layout. " +
    "If the image doesn't look like a floor plan or floor sketch at all, return {\"rooms\": [], \"dimensionsFromSketch\": false}.";

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: "Convert this hand-drawn floor plan into structured room data." },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error("Anthropic floor plan generation error:", await response.text());
      return NextResponse.json({ error: "AI request failed" }, { status: 502 });
    }

    const data = await response.json();
    // Look for the text block by type, not by fixed position — the model can return a
    // "thinking" block before the actual "text" block, which would otherwise silently
    // produce no usable text if content[0] were assumed to always be the answer.
    const textBlock = Array.isArray(data.content) ? data.content.find((block: any) => block?.type === "text") : undefined;
    const rawText: string | undefined = textBlock?.text?.trim();
    if (!rawText) {
      console.error("Anthropic response had no usable text:", JSON.stringify(data));
      return NextResponse.json({ error: "No response from AI" }, { status: 502 });
    }

    const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();

    let parsed: { rooms: any[]; dimensionsFromSketch: boolean };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse AI floor plan response:", rawText);
      return NextResponse.json({ error: "AI returned an unexpected format — please try again." }, { status: 502 });
    }

    if (!Array.isArray(parsed.rooms)) {
      return NextResponse.json({ error: "AI returned an unexpected format — please try again." }, { status: 502 });
    }

    // Basic sanity filtering — same reasoning as the manual entry validation elsewhere in
    // this feature: reject anything with a missing name or a nonsensical dimension, rather
    // than passing bad data through to the editor.
    const validRooms = parsed.rooms.filter(
      (r) => typeof r?.name === "string" && r.name.trim() && typeof r.widthM === "number" && r.widthM > 0 && r.widthM <= 30 && typeof r.lengthM === "number" && r.lengthM > 0 && r.lengthM <= 30
    );

    return NextResponse.json({ rooms: validRooms, dimensionsFromSketch: !!parsed.dimensionsFromSketch });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
