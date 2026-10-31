import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { checkRateLimit } from "@/lib/rateLimit";

const FEATURES = new Set(["damp_assessment", "meter_reading", "label_reading"]);
const ACTIONS = new Set(["shown_offered", "shown_declined", "used", "used_all", "copied"]);
const CONFIDENCE = new Set(["high", "medium", "low"]);

// Writes ONE structured line to the server log for each AI outcome (search the Vercel logs for "ai_outcome" and count). Only values
// from fixed lists are ever written, so nothing a user types can end up in the log, and nothing personal is recorded.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const companyId = (session.user as any).companyId as string | null;
  if (!companyId) return NextResponse.json({ error: "Not available" }, { status: 403 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const feature = typeof body?.feature === "string" && FEATURES.has(body.feature) ? body.feature : null;
  const action = typeof body?.action === "string" && ACTIONS.has(body.action) ? body.action : null;
  if (!feature || !action) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const confidence = typeof body?.confidence === "string" && CONFIDENCE.has(body.confidence) ? body.confidence : undefined;
  const limit = await checkRateLimit(`ai-outcome:${session.user.id}`, 200, 15);
  if (!limit.allowed) return new NextResponse(null, { status: 429 });
  console.info(JSON.stringify({ event: "ai_outcome", feature, action, ...(confidence ? { confidence } : {}), company: companyId }));
  return new NextResponse(null, { status: 204 });
}
