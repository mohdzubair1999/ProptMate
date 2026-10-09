import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rateLimit";
import { findMatchingCheckInInspection, findMatchingCheckInItem } from "@/lib/findMatchingCheckIn";
import { fetchAndResizeImage } from "@/lib/fetchAndResizeImage";

export const maxDuration = 60;

// Caps how many photos from each side go into the vision call - enough to genuinely cover
// an item (a few different angles), without the request size or cost scaling unboundedly for
// an item that happens to have a lot of photos attached.
const MAX_PHOTOS_PER_SIDE = 5;

type DisputeRiskResult = {
  classification: "fair_wear_and_tear" | "tenant_responsibility" | "landlord_responsibility" | "unclear";
  reasoning: string;
  confidence: "high" | "medium" | "low";
  evidenceNote: string | null;
};

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rateLimit = await checkRateLimit(`dispute-risk:${session.user.id}`, 60, 15);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many assessments run recently - please wait a few minutes" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Dispute risk assessment isn't configured yet - add ANTHROPIC_API_KEY to your environment." }, { status: 500 });
  }

  const body = await req.json();
  const itemId = body.itemId as string | undefined;
  if (!itemId) return NextResponse.json({ error: "Missing itemId" }, { status: 400 });

  const companyId = (session.user as any).companyId as string | null;
  const item = await prisma.inspectionItem.findFirst({
    where: { id: itemId, inspection: { property: { companyId: companyId || undefined }, deletedAt: null } },
    include: { inspection: { select: { id: true, type: true, propertyId: true, comparedToInspectionId: true, completedDate: true } }, photos: { select: { url: true } } },
  });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  // Only ever runs on a check-out item - there's nothing genuinely prior to compare a
  // check-in (or any other stage) against, so this wouldn't mean anything for those.
  if (item.inspection.type !== "check-out") {
    return NextResponse.json({ error: "Dispute risk assessment only applies to check-out items" }, { status: 400 });
  }

  const checkIn = await findMatchingCheckInInspection(item.inspection, companyId);
  if (!checkIn) {
    const result: DisputeRiskResult = {
      classification: "unclear",
      reasoning: "No matching check-in inspection could be found for this property, so there's genuinely nothing to compare the current condition against.",
      confidence: "low",
      evidenceNote: "Link this check-out to the correct check-in using the 'Comparing against...' option, if one exists, so a real comparison can be made.",
    };
    await saveResult(itemId, result);
    return NextResponse.json(result);
  }

  const checkInItem = await findMatchingCheckInItem(checkIn.id, item.room, item.itemName);
  if (!checkInItem) {
    const result: DisputeRiskResult = {
      classification: "unclear",
      reasoning: `No matching "${item.itemName}" was recorded in the "${item.room}" section at check-in, so there's no genuine baseline to compare the current condition against.`,
      confidence: "low",
      evidenceNote: "If this item genuinely existed at check-in but wasn't recorded under this exact name, consider renaming it to match, or note the omission directly - the absence of a check-in record is itself relevant context for any dispute.",
    };
    await saveResult(itemId, result);
    return NextResponse.json(result);
  }

  // Tenancy length - the actual number of days between check-in and this check-out (or now,
  // if the check-out isn't marked complete yet) - genuinely relevant to whether an amount of
  // wear looks proportionate to how long the property was actually lived in.
  const checkInDate = checkIn.completedDate;
  const checkOutDate = item.inspection.completedDate || new Date();
  const tenancyDays = checkInDate ? Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (24 * 60 * 60 * 1000)) : null;
  const tenancyDescription = tenancyDays !== null ? `approximately ${tenancyDays} days (${Math.round(tenancyDays / 30.44)} months)` : "unknown - no check-in completion date recorded";

  // Both sides' photos, not just text - a genuinely direct visual comparison is more
  // reliable than reasoning purely from whatever text happened to already be written, which
  // is what makes this a meaningfully deeper assessment than the existing text-based
  // check-in comparison already built into the main photo analysis feature.
  let checkOutImages: { base64: string; mediaType: string }[] = [];
  let checkInImages: { base64: string; mediaType: string }[] = [];
  try {
    checkOutImages = await Promise.all(item.photos.slice(0, MAX_PHOTOS_PER_SIDE).map((p) => fetchAndResizeImage(p.url)));
    checkInImages = await Promise.all((checkInItem.photos || []).slice(0, MAX_PHOTOS_PER_SIDE).map((p) => fetchAndResizeImage(p.url)));
  } catch (err) {
    console.error("Failed to load photos for dispute risk assessment:", err);
    return NextResponse.json({ error: "Couldn't load one or more photos for this assessment" }, { status: 502 });
  }

  const systemPrompt =
    "You help a property inspector assess whether a change in an item's condition at check-out, compared to check-in, is likely fair wear and tear, the tenant's responsibility, or the landlord's own maintenance responsibility - to help them prepare well-reasoned notes ahead of a possible deposit dispute, NOT to make a final, binding legal determination. Whoever reads your assessment is the one who actually decides what to do with it. " +
    "Reason using general, well-established UK deposit scheme principles: " +
    "'Fair wear and tear' is the gradual, ordinary decline that happens through normal daily use over time - a carpet's pile flattening, paint dulling, an appliance ageing - a landlord generally cannot charge a tenant for this. " +
    "Weigh the condition against how long the tenancy actually ran - a given amount of wear is more questionable after a short tenancy than a long one, since ordinary use compounds over time, and expected lifespans vary a lot by item type (carpets and decoration wear faster than a boiler or a bath) - reason about what's genuinely plausible for this specific tenancy length, not a fixed rule. " +
    "'Tenant responsibility' is damage beyond ordinary use - something that looks accidental, deliberate, caused by neglect, or otherwise avoidable (a burn mark, a hole, staining inconsistent with normal use, something broken rather than worn). " +
    "'Landlord responsibility' is the property's own structural or mechanical upkeep - something that was always going to need addressing regardless of who lived there (general disrepair, an appliance failure unrelated to misuse, damp from a structural issue). " +
    "If the evidence genuinely doesn't clearly support one conclusion over another, say so honestly as 'unclear' rather than picking a side you can't actually support from what's visible - a wrong confident answer is worse than an honest uncertain one here. " +
    "\n\nReturn ONLY a JSON object, no other text: " +
    '{"classification": "fair_wear_and_tear" | "tenant_responsibility" | "landlord_responsibility" | "unclear", "reasoning": string, "confidence": "high" | "medium" | "low", "evidenceNote": string | null}. ' +
    "reasoning should be a few clear sentences explaining the classification, referencing only what's actually visible in the photos or recorded in the notes given - never invent a detail you can't genuinely support. " +
    "evidenceNote should point out anything that would genuinely strengthen the case if added (e.g. no check-in photo exists for this item at all, or a closer photo of the affected area would help confirm its extent) - or null if the evidence already given is solid enough. " +
    "Never suggest a specific repair or replacement cost, or any monetary figure at all - that's a decision for the person reading this, not something a photo-based assessment should be putting a number on.";

  const userContent: any[] = [
    {
      type: "text",
      text:
        `Item: "${item.itemName}" in "${item.room}". Tenancy length: ${tenancyDescription}.\n\n` +
        `At check-in, this was recorded as: condition "${checkInItem.condition || "not recorded"}"${checkInItem.cleanliness ? `, cleanliness "${checkInItem.cleanliness}"` : ""}, notes: ${checkInItem.notes?.trim() ? `"${checkInItem.notes.trim()}"` : "none recorded"}.\n\n` +
        `Now, at check-out, this is recorded as: condition "${item.condition || "not recorded"}", notes: ${item.notes?.trim() ? `"${item.notes.trim()}"` : "none recorded"}.\n\n` +
        `${checkInImages.length > 0 ? "The check-in photo(s) follow first, then the check-out photo(s)." : "No check-in photo is available - only the check-out photo(s) follow."}`,
    },
  ];
  for (const img of checkInImages) {
    userContent.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }
  for (const img of checkOutImages) {
    userContent.push({ type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } });
  }

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => "");
    console.error("Dispute risk assessment failed:", aiRes.status, errText);
    return NextResponse.json({ error: "Couldn't complete this assessment - please try again" }, { status: 502 });
  }

  const aiData = await aiRes.json();
  const responseText: string = aiData.content?.[0]?.text || "{}";

  let result: DisputeRiskResult;
  try {
    const cleaned = responseText.replace(/^```json\s*|\s*```$/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const validClassifications = ["fair_wear_and_tear", "tenant_responsibility", "landlord_responsibility", "unclear"];
    const validConfidences = ["high", "medium", "low"];
    result = {
      classification: validClassifications.includes(parsed.classification) ? parsed.classification : "unclear",
      reasoning: typeof parsed.reasoning === "string" && parsed.reasoning.trim() ? parsed.reasoning.trim() : "Assessment couldn't be completed with confidence from the information available.",
      confidence: validConfidences.includes(parsed.confidence) ? parsed.confidence : "low",
      evidenceNote: typeof parsed.evidenceNote === "string" && parsed.evidenceNote.trim() ? parsed.evidenceNote.trim() : null,
    };
  } catch {
    result = {
      classification: "unclear",
      reasoning: "The assessment couldn't be parsed correctly - please try running it again.",
      confidence: "low",
      evidenceNote: null,
    };
  }

  await saveResult(itemId, result);
  return NextResponse.json(result);
}

async function saveResult(itemId: string, result: DisputeRiskResult) {
  await prisma.inspectionItem.update({
    where: { id: itemId },
    data: {
      disputeRiskClassification: result.classification,
      disputeRiskReasoning: result.reasoning,
      disputeRiskConfidence: result.confidence,
      disputeRiskEvidenceNote: result.evidenceNote,
      disputeRiskAssessedAt: new Date(),
    },
  });
}
