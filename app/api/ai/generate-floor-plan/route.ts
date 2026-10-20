import { aiRateLimit } from "@/lib/aiGuard";
import { getSession } from "@/lib/session";
import { NextResponse } from "next/server";
import { prepareSketchImage, readSketch } from "@/lib/sketchPipeline";

// Generous but bounded — a hand-drawn sketch photographed on a phone can be large, and this
// endpoint only needs to run once per upload, not repeatedly like the photo-analysis route.
export const maxDuration = 60;

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const limited = await aiRateLimit(session, "generate-floor-plan", { max: 30, windowMin: 15 });
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
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

  let imageBase64: string;
  try {
    imageBase64 = await prepareSketchImage(Buffer.from(await file.arrayBuffer()));
  } catch (err) {
    console.error("Couldn't process uploaded sketch:", err);
    return NextResponse.json({ error: "Couldn't read that image — please try a different file." }, { status: 400 });
  }

  try {
    const outcome = await readSketch({ apiKey, imageBase64 });
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    const { rooms, dimensionsFromSketch, unit, warnings, counts } = outcome.result;
    // Each room carries sizeSource ("written" = read from the person's own writing, "estimated", "unverified"), so the
    // screen can say which sizes to trust and which to check, room by room.
    return NextResponse.json({ rooms, dimensionsFromSketch, unit, warnings, counts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "AI request failed" }, { status: 500 });
  }
}
