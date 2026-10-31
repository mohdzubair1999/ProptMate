import sharp from "sharp";
import { cleanSketchRooms, extractJson, type CleanResult } from "./sketchPlan";
import { postJsonWithRetry } from "./aiHttp";

// Reading a hand-drawn floor plan. One code path, used by the live upload route AND by the accuracy scoring script
// (scripts/eval-sketch-accuracy.ts), so what you measure is exactly what people get.

export const SKETCH_MODEL = "claude-sonnet-5";

// What can honestly be taken from a drawing: the layout, rough shapes and which rooms connect. Real sizes come only
// from numbers the person wrote, which the model COPIES (code converts them), or from the person's own measurement.
const MEASUREMENT_RULES =
  "MEASUREMENTS. widthM is a room's left-to-right size as drawn on the page and lengthM is its top-to-bottom size. " +
  "widthText and lengthText must be the measurement for that side of that room copied EXACTLY as it is written on the sketch, character for character " +
  "(for example \"3.5m\", \"12'6\\\"\", \"12ft 6in\", \"3500\", \"3m50\"), or null if that side has no written measurement that clearly belongs to that room. " +
  "Do not convert, round or calculate when you fill in widthText and lengthText: just copy what is written, even if a digit is hard to read (give your best reading). " +
  "If a measurement is written along an outer wall and covers several rooms, do not guess how to split it: leave widthText and lengthText null for those rooms. " +
  "Set unit to the unit the sketch uses (m, ft, mm or cm), or 'unknown' if the numbers have no unit written. " +
  "widthM and lengthM must always be numbers in metres: when the sketch gives the measurement, give your best conversion of it; when it does not, estimate using typical UK residential proportions for that room type, " +
  "scaled so the rooms' RELATIVE sizes match what is drawn (a room drawn twice as large as another should have roughly twice the floor area). " +
  "Set sizeSource to 'written' only when BOTH widthText and lengthText are non-null for that room, otherwise 'estimated'. Never present an estimate as if it was read from the sketch. " +
  "Set dimensionsFromSketch to true only if every room's sizeSource is 'written'.";

const SCHEMA =
  '{"unit": "m" | "ft" | "mm" | "cm" | "unknown", "rooms": [{"name": string, "widthText": string | null, "lengthText": string | null, "sizeSource": "written" | "estimated", "widthM": number, "lengthM": number, ' +
  '"shape": "rectangle" | "bay-window" | "l-shape" | "angled-corner" | "trapezoid" | "sloped-top", "bayWidthM": number | null, "bayDepthM": number | null, "notchWidthM": number | null, "notchDepthM": number | null, ' +
  '"notchCorner": "top-left" | "top-right" | "bottom-left" | "bottom-right" | null, "angledCutWidthM": number | null, "angledCutDepthM": number | null, "angledCorner": "top-left" | "top-right" | "bottom-left" | "bottom-right" | null, ' +
  '"trapezoidTopWidthM": number | null, "trapezoidSide": "left" | "right" | "both" | null, "slopedTopAmountM": number | null, "slopedTopSide": "left" | "right" | null, "hasBayWindow": boolean, "connectsTo": string[]}], "dimensionsFromSketch": boolean}';

export const SKETCH_SYSTEM_PROMPT = [
  "You analyse a hand-drawn or sketched floor plan image and convert it into structured room data for a floor plan tool.",
  "Look at the rooms drawn, their approximate relative sizes and positions, their rough shape, and which rooms appear connected by a door or opening (rooms drawn touching or with a door marked between them).",
  "Return ONLY a JSON object with this exact structure, no other text: " + SCHEMA + ".",
  "For each room's name: use a label actually written on the sketch if present, otherwise a reasonable generic name (Bedroom, Kitchen, Bathroom, Living room, Hallway, etc), numbering duplicates (Bedroom 1, Bedroom 2). ",
  MEASUREMENT_RULES,
  "For shape: use 'rectangle' unless the room is clearly drawn with one of these distinct features. 'l-shape': a rectangular notch cut from one corner (use notchWidthM/notchDepthM/notchCorner). 'angled-corner': one corner cut off at a diagonal rather than a square notch (use angledCutWidthM/angledCutDepthM/angledCorner). 'trapezoid': the top wall is shorter than the bottom wall, or vice versa, sloping inward from one or both sides rather than running straight across (use trapezoidTopWidthM for the shorter wall's width, and trapezoidSide for which side(s) slope in). 'sloped-top': the top wall runs diagonally, one top corner higher than the other, rather than a symmetric trapezoid (use slopedTopAmountM for how much lower the shorter side is, and slopedTopSide for which side is the shorter/lower one). 'bay-window': a window bay protruding from one wall as the room's entire distinguishing feature (use bayWidthM/bayDepthM). Leave every unused shape-specific field as null. ",
  "Separately from shape: if the room ALSO has a bay window on one of its walls in addition to whatever its main shape already is (e.g. an L-shaped room that also has a bay window on one of its straight walls, not the notched one) — a genuinely different situation from shape=='bay-window', which is for a room whose only distinguishing feature IS the bay — set hasBayWindow to true and estimate bayWidthM/bayDepthM for it. Never set hasBayWindow to true when shape is already 'bay-window' itself, since that shape already fully represents the room's one bay. ",
  "For connectsTo: list the exact names of other rooms in your own output that this room appears to have a door or opening to, based on the sketch — walls drawn without any gap or door mark mean no connection. ",
  "Order the rooms array left-to-right, top-to-bottom roughly matching the sketch's layout. ",
  'If the image doesn\'t look like a floor plan or floor sketch at all, return {"unit": "unknown", "rooms": [], "dimensionsFromSketch": false}.',
].join(" ");

// Same preparation the route always did: honour the phone's rotation (EXIF), and shrink to the size the model reads best.
export async function prepareSketchImage(buffer: Buffer): Promise<string> {
  const out = await sharp(buffer)
    .rotate() // a phone photo of a paper sketch is often stored sideways with an orientation tag
    .resize({ width: 1568, height: 1568, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return out.toString("base64");
}

type Msg = { role: "user" | "assistant"; content: any };
export type SketchOutcome =
  | { ok: true; result: CleanResult; attempts: number }
  | { ok: false; error: string; status: number };

async function ask(apiKey: string, messages: Msg[], fetchImpl: typeof fetch): Promise<{ text: string } | { error: string; status: number }> {
  const r = await postJsonWithRetry({
    url: "https://api.anthropic.com/v1/messages",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    // low temperature: this is reading a drawing, not being creative
    body: (withoutTemperature) => ({ model: SKETCH_MODEL, max_tokens: 3000, system: SKETCH_SYSTEM_PROMPT, ...(withoutTemperature ? {} : { temperature: 0.2 }), messages }),
    temperatureFallback: true,
    label: "Anthropic floor plan generation",
    fetchImpl,
    budgetMs: 50_000,
  });
  if (!r.ok) return { error: r.status === 504 ? r.error : "AI request failed", status: r.status };
  // Look for the text block by type, not by position: a "thinking" block can come first.
  const block = Array.isArray(r.data.content) ? r.data.content.find((b: any) => b?.type === "text") : undefined;
  const text: string | undefined = block?.text?.trim();
  if (!text) {
    console.error("Anthropic response had no usable text:", JSON.stringify(r.data));
    return { error: "No response from AI", status: 502 };
  }
  return { text };
}

// Reads one sketch. If the first reply is not usable JSON it asks once more (never more than twice), because a
// second attempt usually succeeds and the person has already waited.
export async function readSketch(opts: { apiKey: string; imageBase64: string; fetchImpl?: typeof fetch }): Promise<SketchOutcome> {
  const f = opts.fetchImpl ?? fetch;
  const first: Msg = {
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: opts.imageBase64 } },
      { type: "text", text: "Convert this hand-drawn floor plan into structured room data." },
    ],
  };
  const r1 = await ask(opts.apiKey, [first], f);
  if ("error" in r1) return { ok: false, error: r1.error, status: r1.status };
  let parsed = extractJson(r1.text);
  let attempts = 1;
  if (!parsed || !Array.isArray(parsed.rooms)) {
    attempts = 2;
    const r2 = await ask(
      opts.apiKey,
      [first, { role: "assistant", content: r1.text.slice(0, 4000) }, { role: "user", content: "That was not valid JSON in the required structure. Reply again with ONLY the JSON object, nothing else." }],
      f
    );
    if ("error" in r2) return { ok: false, error: r2.error, status: r2.status };
    parsed = extractJson(r2.text);
    if (!parsed || !Array.isArray(parsed.rooms)) {
      console.error("Failed to parse AI floor plan response twice:", r1.text.slice(0, 500), "|", r2.text.slice(0, 500));
      return { ok: false, error: "AI returned an unexpected format — please try again.", status: 502 };
    }
  }
  return { ok: true, result: cleanSketchRooms(parsed), attempts };
}
