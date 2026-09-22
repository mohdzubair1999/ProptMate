import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// Reads an uploaded certificate (PDF or photo) and extracts the key fields — expiry date,
// issue date, certificate number, issuing body — so the inspector doesn't have to type them
// in by hand. Always returned for human review, never auto-saved directly, since a misread
// date here is exactly the kind of mistake that matters (compliance tracking).
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const MAX_SIZE = 20 * 1024 * 1024; // 20MB — comfortably under Anthropic's per-file limits
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File is too large (max 20MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString("base64");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  const systemPrompt =
    "You extract key details from UK property compliance certificates (Gas Safety, EICR, EPC, HMO/Selective Licence, Fire Risk Assessment, Legionella Risk Assessment, PAT Testing) so a letting agent doesn't have to type them in by hand. " +
    "First, identify which of these document types it actually is, based on what's shown — don't trust any hint about the expected type, since the person uploading may not have selected the right type yet. Use exactly one of: GAS_SAFETY, EICR, EPC, HMO_LICENCE, SELECTIVE_LICENCE, FIRE_RISK_ASSESSMENT, LEGIONELLA_RISK_ASSESSMENT, PAT_TESTING, OTHER. " +
    "Then find: the issue date (sometimes called date of inspection, date issued, or certificate date), the expiry date (sometimes called valid until, next inspection due, renewal date, or expiry date), the certificate/reference number, and the issuing body (the company, engineer, or assessor who issued it — not the letting agent or landlord). " +
    'These are UK documents — any date written as numbers only (e.g. "05/08/2026") is DD/MM/YYYY (day first), not the US MM/DD/YYYY format, even when both numbers could be read either way. ' +
    "Respond with ONLY a JSON object, no other text, in exactly this shape: " +
    '{"documentType": "one of the type codes above", "issueDate": "YYYY-MM-DD or null", "expiryDate": "YYYY-MM-DD or null", "certificateNumber": "string or null", "issuingBody": "string or null", "confidence": "high, medium, or low"}. ' +
    "Use null for any field you genuinely can't find or aren't confident about — never guess a plausible-looking date or number that isn't actually shown on the document. " +
    "Set confidence to \"low\" if the document is blurry, cut off, or doesn't look like a real certificate, so the person reviewing knows to double-check everything.";

  const userPrompt = "Identify the document type and extract the fields as instructed.";

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
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
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
    const rawText = data.content?.find((c: any) => c.type === "text")?.text || "";

    // Strip markdown code fences in case the model wraps the JSON despite instructions
    const cleaned = rawText.replace(/```json|```/g, "").trim();
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
