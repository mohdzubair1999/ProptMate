import { MODELS, callVisionTool, type Provider, type Img, type Part as VisionPart } from "@/lib/ai/vision";
import { DETAIL_SYSTEM, DETAIL_TOOL, detailSchema, detailsToBrief, hasContent, mergeDetails, normaliseDetails, type PhotoDetails } from "@/lib/photoDetails";
import { clarifyMarkers, findWordingBreaches, type Breach } from "@/lib/photoWording";
import { postJsonWithRetry } from "@/lib/aiHttp";

// Describing photos for an inspection report. One code path, used by the live route AND by the accuracy scoring script
// (scripts/eval-photo-analysis.ts), so what is measured is exactly what people get.

export type RefImage = { label: string; base64: string; mediaType: string };

// Added to every instruction that forbids advice (inventory reports): an inventory records what can be SEEN.
export const NOT_TESTED_RULE =
  "Never write that something was \"not tested\", \"not checked\", \"untested\" or \"unable to be verified\" - an inventory records only what can be seen, so leave out anything that can't be seen rather than saying it wasn't tested. ";

export type PromptArgs = {
  identifyRoom: boolean;
  allowRecommendations: boolean;
  imageCount: number;
  referenceImages: { label: string }[];
  existingNotes?: string | null;
  context?: string | null;
  checkInContext?: string | null;
  // how many CHECK-IN photos accompany the current ones (0 = none: the prompt is then exactly what it has always been)
  checkInImageCount?: number;
  // ask for the full range of detail an inspector records (colour and finish, readable labels, quantities, where each mark is, how big, how clean)
  coverage?: boolean;
  // the observation list from the first, careful pass of a detailed analysis: the description must cover each point that the photos confirm
  detailBrief?: string | null;
};

// Added to the instructions in every mode. The original brief asked only for "the surface/material and the specific defect", which left out most of what
// a condition report records.
export const COVERAGE_RULE =
  "COVER THE DETAIL a thorough inspector would record, wherever it is visible: the colour and finish of each surface; any make, model or printed label you can read exactly (copy it character for character and never guess a character); how many of each item there are; " +
  "where on the item or in the frame each mark or defect is; how large or widespread each one is (a single small mark, several along an edge, most of the surface); and how clean it is (dust, grease, limescale, residue). " +
  "Describe EACH distinct defect separately rather than summarising them as minor wear. Do not leave out an item because it looks fine: briefly saying that it shows no visible defect is useful. Never add detail that you cannot see. ";

// The instructions the AI is given. The wording is the product of a lot of real use, so it is kept exactly as it was
// except for three deliberate changes, all affecting inventory reports only: the "not tested" rule above (twice), and
// the cause of a stain being "not determinable from the photo" rather than "needing on-site investigation", because
// that is itself advice.
export function buildPrompts(args: PromptArgs): { systemPrompt: string; userPrompt: string } {
  const { identifyRoom, allowRecommendations, imageCount, referenceImages, existingNotes, context, checkInContext } = args;
  const checkInImageCount = Math.max(0, Math.floor(args.checkInImageCount ?? 0));
  const multiple = imageCount > 1;
  const coverage = args.coverage ? COVERAGE_RULE : "";

  const referenceInstruction =
    referenceImages.length > 0
      ? `\n\nThe first ${referenceImages.length} image(s) you're shown are REFERENCE photos, each already confirmed to be from a specific room (labelled below). The remaining images are the unlabeled photos you need to identify. For each unlabeled photo, compare it against the reference photos — same wall colour, flooring, fixtures, furniture, decor style — and if it visually matches a reference room, use that room's exact name. If a photo doesn't plausibly match ANY of the reference rooms (e.g. it's an area with no reference photo, like a garden, garage, or communal area), don't force a bad match — instead label it with your best general guess of the area type, or "Unidentified area" if genuinely unclear, and keep it as its own separate entry rather than merging it into a reference room it doesn't actually match. Reference labels: ${referenceImages
          .map((r) => r.label)
          .join(", ")}.`
      : "";

  const systemPrompt = identifyRoom
    ? // Maintenance-section mode: photos may be pooled from different rooms with no known
      // room per photo — the AI has to work out the room from what's visible, not assume.
      "You help a property inspector document maintenance issues from photos, to speed up their report writing — you are assisting, not replacing their judgement. " +
      "These photos may come from DIFFERENT rooms or areas in the property, pooled together in one batch — do not assume they're all the same room. " +
      "First, work out which room/area each photo is most likely from, based on visible cues (tiles and sanitaryware suggest a bathroom, kitchen units suggest a kitchen, a radiator plus wardrobe/bed suggests a bedroom, a radiator plus sofa/TV suggests a living room, etc) and any hint text provided. Always commit to a single best-guess room type per photo — never hedge, never say unclear, and never use a [CLARIFY] marker (described below) for which room a photo is from - that mechanism is only for material and defect-severity uncertainty within an entry, never for the room itself. " +
      "IMPORTANT: you have no way of knowing how many rooms of each type the property actually has. Different photos of the SAME room (different corners, angles, or close-ups) will often look different from each other — don't mistake this for evidence of separate rooms. " +
      'Only split same-type rooms into numbered instances (e.g. "Bedroom 1", "Bedroom 2") if there is clear, specific evidence they are physically different rooms — e.g. different bed/furniture style, a different window position or wall colour that couldn\'t plausibly be the same room from another angle. If you\'re not sure whether photos are the same room or different rooms of the same type, default to treating them as the SAME room and combine them into one entry — inventing extra rooms that don\'t exist is worse than under-splitting. ' +
      "Then describe each photo, one entry per photo (do not try to merge or group entries yourself — that happens afterward in code, not by you). " +
      coverage +
      "Within each entry, describe only what's visibly present: the surface/material and the specific defect(s) if any. For a genuinely important uncertainty you can't resolve from the photo alone - specifically the exact material (e.g. can't tell if flooring is tile or a tile-effect vinyl) or how severe/extensive a defect is (e.g. can't tell if a crack is superficial or structural) - don't guess and don't just hedge in the description. Instead, insert a clearly-marked question in this exact format: [CLARIFY: your specific question]. The inspector is standing there and can resolve this in seconds by looking or touching, which you can't do from a photo. Place each marker as its own separate sentence, never embedded in the middle of another sentence - this marker gets removed from the final text, so the surrounding sentence needs to still read correctly without it. Use this sparingly, only for genuinely important uncertainties - not every minor detail - and include more than one marker if there's more than one real uncertainty in the same entry. Colour is different - it's usually a lighting artifact rather than a genuine ambiguity, so just describe it in general terms (e.g. \"cream or off-white walls\") rather than asking about it. Never guess at a cause you can't actually see (e.g. don't claim a pipe burst if you only see a stain). " +
      (allowRecommendations
        ? "Where there's a genuine defect, you may add a brief, practical recommendation for addressing it (e.g. 're-seal recommended', 'requires professional repair') - keep it short and practical, not the main focus of the entry, and only when there's an actual defect to act on. "
        : "Describe the defect itself, not what should be done about it - never suggest repairs, recommend action, or advise what should be done; that call belongs to the inspector, not you. " + NOT_TESTED_RULE) +
      'The label for each entry MUST be a room or area name (e.g. "Bathroom", "Bedroom", "Kitchen", "Living room", "Hallway") — never a surface or material name like "Wall" or "Ceiling" as a substitute for actually naming the room. If cues are weak, still commit to your best-guess room type rather than falling back to describing the surface instead. ' +
      'Format each entry as: "Room: description." — one line per photo, no "Photo N" numbering. If a photo shows nothing concerning, say so plainly rather than inventing an issue. ' +
      "Do not add a summary, conclusion, or any text after the last entry." +
      referenceInstruction
    : "You help a property inspector document the condition of an item or area from photos, for an inventory/condition report, to speed up their report writing — you are assisting, not replacing their judgement. " +
      "If the inspector has given you a specific instruction to follow (this will be made clear further below), prioritise answering or acting on that directly over giving a generic description. Otherwise, describe what's visible as set out below. " +
      (multiple
        ? "You'll be shown multiple photos of the same item/area — some may be different angles of one single issue, but with many photos it's just as likely there are several genuinely different, distinct issues visible across them (a crack in one photo, staining in another, a separate defect in a third). Don't assume it's all one situation just because it's one batch — actually look at what's different across the photos. "
        : "") +
      coverage +
      "Describe only what's visibly present — the surface/material and the specific defect if any (cracking, staining, damage, wear, etc). For a genuinely important uncertainty you can't resolve from the photo alone - specifically the exact material (e.g. can't tell if flooring is tile or a tile-effect vinyl) or how severe/extensive a defect is (e.g. can't tell if a crack is superficial or structural) - don't guess and don't just hedge in the description. Instead, insert a clearly-marked question in this exact format: [CLARIFY: your specific question]. The inspector is standing there and can resolve this in seconds by looking or touching, which you can't do from a photo. Place each marker as its own separate sentence, never embedded in the middle of another sentence - this marker gets removed from the final text, so the surrounding sentence needs to still read correctly without it. Use this sparingly, only for genuinely important uncertainties - not every minor detail - and include more than one marker if there's more than one real uncertainty. Colour is different - it's usually a lighting artifact rather than a genuine ambiguity, so just describe it in general terms (e.g. \"cream or off-white walls\") rather than asking about it. " +
      "Never guess at a cause you can't actually see in the image(s) (e.g. don't claim a pipe burst if you only see a stain — say the stain pattern instead, and that " + (allowRecommendations ? "the cause needs on-site investigation" : "the cause can't be determined from the photo") + "). " +
      (allowRecommendations
        ? "This is a mid-term, HMO, legionella, or maintenance inspection, not a check-in/check-out inventory - where there's a genuine defect, you may add a brief, practical recommendation for addressing it (e.g. 're-seal recommended', 'requires professional repair'). Keep it short and practical, not the main focus of the response, and only when there's an actual defect to act on. "
        : "IMPORTANT: this is a factual inventory/condition record, not a maintenance recommendation. State only what is observed - never suggest repairs, recommend action, advise what should be done, or use phrasing like 'should be repaired', 'recommend replacing', or 'requires attention'. Describing the defect itself (e.g. 'the seal shows visible cracking') is correct; telling the reader what to do about it is not this report's job. " + NOT_TESTED_RULE) +
      "If nothing concerning is visible, say so plainly rather than inventing an issue. Write as continuous prose in one unbroken paragraph — never use headers, bold section titles, or bullet points, even if there's a lot to cover across several photos; weave everything into flowing sentences instead. " +
      "IMPORTANT: never omit a real, distinct, visible issue just to keep the response short — the right length depends entirely on how much is actually there. A few photos of one situation might genuinely only need 2-4 sentences; many photos covering several different, real issues should get one clear sentence or clause per distinct issue, however many that ends up being. Don't pad or invent detail to sound thorough, but don't compress multiple genuinely different problems into one vague sentence either — a report that leaves something out is worse than one that runs a bit longer.";

  const notesHint =
    existingNotes && existingNotes.trim()
      ? identifyRoom
        ? `\n\nThe inspector has already noted: "${existingNotes.trim()}" — use this alongside the visual cues to help identify which room each photo is likely from, if relevant.`
        : `\n\nThe inspector has written this as an instruction for you to follow, not just background text: "${existingNotes.trim()}" — use the photo(s) to directly address it. If it's a question (e.g. "is the tap leaking?" or "check the seal"), answer it plainly based on what's visible. If it names something specific to check or describe, focus your response on that rather than giving a generic overview of the whole photo. If what's visible doesn't let you answer with confidence, say so plainly rather than guessing.`
      : "";

  let userPrompt =
    (context ? `Context: ${context}\n\n` : "") +
    (identifyRoom
      ? `Describe ${imageCount > 1 ? `each of these ${imageCount} photos` : "this photo"} for a maintenance report, identifying the likely room for each.`
      : multiple
      ? `Describe these ${imageCount} photos together for this report.`
      : "Describe this photo for this report.") +
    notesHint +
    (checkInContext
      ? `\n\nAt check-in, this was recorded as: ${checkInContext}. Compare what you actually see now against this. If it looks consistent with the check-in record, say so briefly. If you can see something that looks like new damage, wear, or a change not reflected in the check-in notes, describe that distinctly from what was already there - don't blend the two into one vague description. Be careful not to mistake a difference in how something is named or described for an actual physical change - if the check-in record names a material or colour differently than how you'd describe it now, consider whether that's a genuine change or just two different, both-plausible descriptions of the same thing, and only report it as a change if the photo itself shows something different, not just because the wording doesn't match. If you're genuinely unsure whether something is new damage or just how the item already was, use a [CLARIFY: question] marker rather than guessing either way. If the check-in notes are too vague or brief to compare against with any real confidence, just describe current condition normally rather than inventing a comparison you can't actually support from what's visible.`
      : "");

  // Photo-to-photo comparison at check-out. Only when check-in photos were actually supplied, so everything else is unchanged.
  if (checkInImageCount > 0) {
    userPrompt +=
      ` The first ${checkInImageCount === 1 ? "photo" : `${checkInImageCount} photos`} above ${checkInImageCount === 1 ? "is" : "are"} from the CHECK-IN, taken when the tenancy began, and ${checkInImageCount === 1 ? "is" : "are"} labelled as such. ` +
      "The photos after them show the item NOW, at check-out. Compare them. After describing its current condition, state plainly what is visibly different from the check-in photos " +
      "(for example new marks, damage, staining, missing parts, or a change in cleanliness), or state that no difference is visible. " +
      "A different angle, distance or lighting is NOT a change: if you cannot tell whether something is new or was already there at check-in, say that you cannot tell from these photos. " +
      "Describe only what you can see. Do not say how a change happened or who is responsible, and do not recommend any action.";
  }
  if (args.detailBrief && args.detailBrief.trim()) {
    userPrompt +=
      "\n\nA first, careful pass over these photos produced the observation list below. Check every point against the photos. Include each point you can confirm in your description, in the same wording style as the rest, " +
      "and leave out any point you cannot see. Do not add detail that is in neither the photos nor this list. Keep it as one description.\n" +
      args.detailBrief.trim();
  }
  return { systemPrompt, userPrompt };
}

// ---- choosing the model --------------------------------------------------------------------------------------------

// The models are the ones the app already used. They can be swapped without a code change (to compare them with the
// scoring script) by setting ANTHROPIC_PHOTO_MODEL_STANDARD / _DEEP or OPENAI_PHOTO_MODEL_STANDARD / _DEEP.
export function modelFor(provider: Provider, deep: boolean, env: Record<string, string | undefined> = process.env): string {
  const name = `${provider.toUpperCase()}_PHOTO_MODEL_${deep ? "DEEP" : "STANDARD"}`;
  const override = env[name];
  if (override && /^[A-Za-z0-9._:-]{3,80}$/.test(override)) return override;
  return MODELS[provider][deep ? "deep" : "standard"];
}

// ---- asking the model ----------------------------------------------------------------------------------------------

export type Part = { type: "text"; text: string } | { type: "image"; base64: string; mediaType: string };
export type VisionReply = { ok: true; text: string; truncated: boolean; attempts: number } | { ok: false; error: string; status: number };

// One question to the model, with the care a busy service needs: it tries again (at most twice more) when the service is
// briefly overloaded or unreachable, never when the request itself is wrong, and never past the time the page can wait.
// It reads the answer by block type (not "the first block"), so extra blocks cannot break it.
export async function visionText(o: {
  provider: Provider;
  model: string;
  system: string;
  parts: Part[];
  maxTokens?: number;
  keys: { anthropic?: string; openai?: string };
  fetchImpl?: typeof fetch;
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}): Promise<VisionReply> {
  const maxTokens = o.maxTokens ?? 8000;
  const anthropic = o.provider === "anthropic";
  const r = await postJsonWithRetry({
    url: anthropic ? "https://api.anthropic.com/v1/messages" : "https://api.openai.com/v1/chat/completions",
    headers: anthropic
      ? { "Content-Type": "application/json", "x-api-key": o.keys.anthropic || "", "anthropic-version": "2023-06-01" }
      : { "Content-Type": "application/json", Authorization: `Bearer ${o.keys.openai || ""}` },
    body: (withoutTemperature) =>
      anthropic
        ? {
            model: o.model,
            max_tokens: maxTokens,
            system: o.system,
            ...(withoutTemperature ? {} : { temperature: 0.3 }),
            messages: [{ role: "user", content: o.parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.base64 } })) }],
          }
        : {
            model: o.model,
            temperature: 0.3,
            max_tokens: maxTokens,
            messages: [{ role: "system", content: o.system }, { role: "user", content: o.parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.base64}` } })) }],
          },
    temperatureFallback: anthropic,
    label: `${o.provider} vision`,
    fetchImpl: o.fetchImpl,
    sleep: o.sleep,
    now: o.now,
    budgetMs: o.budgetMs,
  });
  if (!r.ok) return r;
  const data = r.data;
  let text = "";
  let truncated = false;
  if (anthropic) {
    text = (Array.isArray(data.content) ? data.content : []).filter((b: any) => b?.type === "text" && typeof b.text === "string").map((b: any) => b.text).join("\n\n").trim();
    truncated = data.stop_reason === "max_tokens";
  } else {
    const c = data.choices?.[0]?.message?.content;
    text = (typeof c === "string" ? c : "").trim();
    truncated = data.choices?.[0]?.finish_reason === "length";
  }
  if (!text) return { ok: false, error: "No response from AI", status: 502 };
  if (truncated) console.error(`[photo analysis] The answer hit the length limit and was cut off`);
  return { ok: true, text, truncated, attempts: r.attempts };
}

// ---- grouping by room ----------------------------------------------------------------------------------------------

// Same-room lines are merged here, in code, rather than hoping the AI groups them across a dozen photos.
export function mergeRoomLines(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const roomOrder: string[] = [];
  const roomDescriptions = new Map<string, string[]>();
  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue; // skip anything that doesn't match "Room: description"
    const room = line.slice(0, colonIndex).trim();
    const description = line.slice(colonIndex + 1).trim();
    if (!room || !description) continue;
    const key = room.toLowerCase();
    if (!roomDescriptions.has(key)) {
      roomOrder.push(room); // keep the AI's original casing for the first occurrence
      roomDescriptions.set(key, []);
    }
    roomDescriptions.get(key)!.push(description);
  }
  // unexpected format: keep the AI's own text rather than return something empty
  if (roomOrder.length === 0) return text;
  return roomOrder.map((room) => `${room}: ${roomDescriptions.get(room.toLowerCase())!.join(" ")}`).join("\n\n");
}

// ---- the whole analysis --------------------------------------------------------------------------------------------

export type AnalyseOptions = {
  images: Img[];
  referenceImages?: RefImage[];
  provider: Provider;
  deep?: boolean;
  identifyRoom?: boolean;
  allowRecommendations: boolean;
  context?: string | null;
  existingNotes?: string | null;
  checkInContext?: string | null;
  // photos of the same item from the check-in (at most 3 are used)
  checkInImages?: Img[];
  keys: { anthropic?: string; openai?: string };
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  budgetMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  // ask for the full range of detail in the instructions (every mode)
  coverage?: boolean;
  // a DETAILED analysis: a first, careful pass lists every item and defect as structured data, then the description is written to cover that list
  detailed?: boolean;
  // close-up crops of large photos for the first pass (photo = which current photo, counting from 0)
  tiles?: { photo: number; label: string; base64: string; mediaType: string }[];
  // the longest the first pass may take; after that the analysis carries on as a normal single pass
  detailBudgetMs?: number;
};
export type DetailPass = "used" | "failed" | "skipped";
export type AnalyseResult =
  | { ok: true; description: string; wasTruncated: boolean; wordingWarnings: string[]; rewritten: boolean; attempts: number; comparedWithCheckIn: number; details: PhotoDetails | null; detailPass: DetailPass }
  | { ok: false; error: string; status: number };

const rewriteRequest = (text: string, breaches: Breach[]) =>
  "The description below breaks the report-wording rules. Rewrite it so that it only states what can be seen. " +
  "Keep every factual observation (each defect, material, location and quantity) and keep the same layout (one line per \"Room: description.\" entry if it is written that way, otherwise the same paragraph form). " +
  "Remove or reword these parts, which give advice or say something was not tested:\n" +
  breaches.map((b) => `- "${b.sentence}"`).join("\n") +
  "\nDo not add advice, recommendations, or any statement that something was or was not tested or checked. Keep every [CLARIFY: ...] question exactly as it is. Return ONLY the rewritten description.\n\nDESCRIPTION:\n" +
  text;

// resolves to null if it takes longer than ms (the work carries on in the background, but its answer is ignored)
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function analysePhotos(o: AnalyseOptions): Promise<AnalyseResult> {
  const refs = o.referenceImages ?? [];
  const checkIn = (o.checkInImages ?? []).slice(0, 3);
  const tStart = (o.now ?? Date.now)();

  // DETAILED analysis, first step: list everything visible as structured data (each photo, plus close-up crops of large ones). If this step
  // fails, finds nothing or runs out of time, the analysis simply carries on as the ordinary single pass: never worse than before.
  let details: PhotoDetails | null = null;
  let detailBrief: string | null = null;
  let detailPass: DetailPass = "skipped";
  if (o.detailed && o.images.length > 0) {
    const stageMs = Math.min(o.detailBudgetMs ?? 24_000, Math.max(5_000, (o.budgetMs ?? 50_000) * 0.5));
    // one pass per group of photos: normally one pass over all the photos together; for photos pooled from DIFFERENT rooms (maintenance), one
    // pass per photo, so each room's photo gets its own list and none is lost in a combined one
    const MAX_ROOM_PASSES = 8;
    const groups: { photos: number[] }[] = o.identifyRoom ? o.images.slice(0, MAX_ROOM_PASSES).map((_, i) => ({ photos: [i] })) : [{ photos: o.images.map((_, i) => i) }];
    const runGroup = async (g: { photos: number[] }): Promise<PhotoDetails | null> => {
      const parts: VisionPart[] = g.photos.map((i) => ({ type: "image" as const, image: o.images[i] }));
      for (const t of (o.tiles ?? []).filter((x) => g.photos.includes(x.photo))) parts.push({ type: "text", text: `Close-up crop (${t.label}) of photo ${t.photo + 1}:` }, { type: "image", image: { base64: t.base64, mediaType: t.mediaType } });
      const named = g.photos.length === 1 ? `photo ${g.photos[0] + 1}` : `these ${g.photos.length} photos`;
      const hasCrops = (o.tiles ?? []).some((x) => g.photos.includes(x.photo));
      parts.push({ type: "text", text: (o.context ? `Context: ${o.context}\n\n` : "") + `List everything visible in ${named}${hasCrops ? " and the close-up crops" : ""} using the tool.` });
      try {
        const r = await withTimeout(
          callVisionTool({ provider: o.provider, depth: "deep", system: DETAIL_SYSTEM, parts, toolName: DETAIL_TOOL, toolDescription: "Report every item and every defect visible, as structured observations.", schema: detailSchema() as Record<string, unknown>, maxTokens: 6000, fetchImpl: o.fetchImpl, sleep: o.sleep, now: o.now, budgetMs: stageMs }),
          stageMs + 1500
        );
        const d = r && r.ok ? normaliseDetails(r.data, { allowRecommendations: o.allowRecommendations }) : null;
        return d && hasContent(d) ? d : null;
      } catch {
        return null;
      }
    };
    const results = await Promise.all(groups.map(runGroup));
    const good = results.map((d, k) => ({ d, k })).filter((x): x is { d: PhotoDetails; k: number } => x.d !== null);
    if (good.length > 0) {
      details = mergeDetails(good.map((x) => x.d));
      detailBrief = o.identifyRoom ? good.map((x) => `Photo ${groups[x.k].photos[0] + 1}:\n${detailsToBrief(x.d)}`).join("\n\n") : detailsToBrief(good[0].d);
      detailPass = "used";
    } else {
      detailPass = "failed";
    }
  }
  const { systemPrompt, userPrompt } = buildPrompts({
    identifyRoom: !!o.identifyRoom,
    allowRecommendations: o.allowRecommendations,
    imageCount: o.images.length,
    referenceImages: refs,
    existingNotes: o.existingNotes,
    context: o.context,
    checkInContext: o.checkInContext ?? null,
    checkInImageCount: checkIn.length,
    coverage: !!o.coverage || !!o.detailed,
    detailBrief,
  });
  const parts: Part[] = [];
  for (const r of refs) parts.push({ type: "text", text: `Reference photo — ${r.label}:` }, { type: "image", base64: r.base64, mediaType: r.mediaType });
  if (refs.length > 0) parts.push({ type: "text", text: "Now here are the unlabeled photos to identify:" });
  checkIn.forEach((img, i) => parts.push({ type: "text", text: `Check-in photo ${i + 1} of ${checkIn.length} (taken when the tenancy began):` }, { type: "image", base64: img.base64, mediaType: img.mediaType }));
  if (checkIn.length > 0) parts.push({ type: "text", text: `Current photo${o.images.length === 1 ? "" : "s"} (this check-out):` });
  for (const img of o.images) parts.push({ type: "image", base64: img.base64, mediaType: img.mediaType });
  parts.push({ type: "text", text: userPrompt });

  const model = modelFor(o.provider, !!o.deep, o.env);
  const t0 = (o.now ?? Date.now)();
  const common = { provider: o.provider, model, system: systemPrompt, keys: o.keys, fetchImpl: o.fetchImpl, sleep: o.sleep, now: o.now };
  // what is left of the request's time after the first pass, so the description always has room to be written
  const firstBudget = o.budgetMs === undefined ? undefined : Math.max(5_000, o.budgetMs - (t0 - tStart));
  const first = await visionText({ ...common, parts, budgetMs: firstBudget ?? (details ? Math.max(5_000, 50_000 - (t0 - tStart)) : undefined) });
  if (!first.ok) return first;

  let text = first.text;
  let attempts = first.attempts;
  let rewritten = false;
  let breaches = findWordingBreaches(text, { allowRecommendations: o.allowRecommendations });
  if (breaches.length > 0) {
    // One rewrite, text only (no photos, so it is quick and cheap). It is accepted only if it genuinely improves things:
    // fewer breaches, every [CLARIFY] question kept, and most of the content still there.
    const left = (o.budgetMs ?? 50_000) - ((o.now ?? Date.now)() - t0);
    if (left > 8000) {
      const fix = await visionText({ ...common, parts: [{ type: "text", text: rewriteRequest(text, breaches) }], budgetMs: left });
      if (fix.ok) {
        attempts += fix.attempts;
        const again = findWordingBreaches(fix.text, { allowRecommendations: o.allowRecommendations });
        const keepsQuestions = clarifyMarkers(text).every((m) => fix.text.includes(m));
        // Removing advice legitimately shortens an answer, so "enough is kept" is measured against the text that was NOT
        // offending: most of that must still be there, and the rewrite must not be empty.
        const offendingLength = [...new Set(breaches.map((b) => b.sentence))].reduce((n, sentence) => n + sentence.length, 0);
        const keepsContent = fix.text.trim().length > 0 && fix.text.length >= Math.max(0, text.length - offendingLength) * 0.6;
        if (again.length < breaches.length && keepsQuestions && keepsContent) {
          text = fix.text;
          breaches = again;
          rewritten = true;
        }
      }
    }
  }
  if (o.identifyRoom) text = mergeRoomLines(text);
  return { ok: true, description: text, wasTruncated: first.truncated, wordingWarnings: [...new Set(breaches.map((b) => b.phrase))], rewritten, attempts, comparedWithCheckIn: checkIn.length, details, detailPass };
}
