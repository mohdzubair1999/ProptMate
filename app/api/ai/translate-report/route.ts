import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { scopeCompanyId } from "@/lib/access";
import { aiRateLimit } from "@/lib/aiGuard";
import { aiFetch } from "@/lib/aiHttp";
import { recordAiUsage } from "@/lib/aiUsage";
import { languageFor, collectStrings, applyTranslations, translateWord, batchStrings, parseTranslation, translateSystemPrompt, UI_WORDS, TRANSLATION_NOTICE } from "@/lib/translateReport";
import { buildSourceReport } from "@/lib/translateSource";

export const maxDuration = 60;
const aiCall = (url: string, init: RequestInit) => aiFetch(url, init, { label: "Translate", budgetMs: 50000 });

// POST { inspectionId, language }: the report is read from the database (never from the request), so this cannot be used as a free translator.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const limited = await aiRateLimit(session, "translate-report", { max: 8, windowMin: 15, companyDaily: 60, usage: "translate-report" });
  if (limited) return limited;
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "Translation isn't configured yet - add ANTHROPIC_API_KEY to your environment." }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const lang = languageFor(body?.language);
  if (!lang) return NextResponse.json({ error: "Please choose a language from the list" }, { status: 400 });
  const inspectionId = typeof body?.inspectionId === "string" ? body.inspectionId : "";
  if (!inspectionId) return NextResponse.json({ error: "Missing inspectionId" }, { status: 400 });

  const companyId = (session.user as any).companyId as string | null;
  const inspection = await prisma.inspection.findFirst({
    where: { id: inspectionId, property: { companyId: scopeCompanyId(companyId) }, deletedAt: null },
    include: { property: { select: { address: true } }, items: true, answers: true, template: { include: { sections: { orderBy: { order: "asc" }, include: { fields: { orderBy: { order: "asc" } } } } } } },
  });
  if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (inspection.status !== "completed") return NextResponse.json({ error: "Complete the inspection before translating its report" }, { status: 400 });

  const source = buildSourceReport(inspection as any);
  const strings = collectStrings(source);
  const batches = batchStrings(strings);
  const results = await Promise.all(batches.map(async (batch) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await aiCall("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY as string, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-5-5", max_tokens: 8000, system: translateSystemPrompt(lang.name), messages: [{ role: "user", content: JSON.stringify(batch) }] }),
      }).catch(() => null);
      if (!res || !res.ok) continue;
      const data = await res.json().catch(() => null);
      const parsed = parseTranslation(data?.content?.[0]?.text, batch.length);
      if (parsed) return parsed;
    }
    return null;
  }));
  if (results.some((r) => r === null)) return NextResponse.json({ error: "The translation didn't come back complete - please try again" }, { status: 502 });
  const translated = (results as string[][]).flat();
  await recordAiUsage(companyId, "translate-report", batches.length);

  return NextResponse.json({
    language: lang.code, name: lang.name, native: lang.native, rtl: lang.rtl,
    report: applyTranslations(source, strings, translated),
    words: Object.fromEntries(UI_WORDS.map((w) => [w, translateWord(w, strings, translated)])),
    notice: TRANSLATION_NOTICE,
    address: inspection.property.address,
  });
}
