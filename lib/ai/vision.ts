import { fetchAndResizeImage } from "@/lib/fetchAndResizeImage";
import { CONDITION_OPTIONS } from "@/lib/inventoryConditions";
import { CLEANLINESS_OPTIONS } from "@/lib/inventoryCleanliness";

export type Depth = "standard" | "deep";
export type Provider = "anthropic" | "openai";
export type Img = { base64: string; mediaType: string };
export type Part = { type: "text"; text: string } | { type: "image"; image: Img };
export type VisionResult = { ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string };

// Standard keeps the fast, low-cost models the app already uses. Deep uses a more capable (and
// costlier) one, and only ever runs when a person explicitly asks for it.
export const MODELS: Record<Provider, Record<Depth, string>> = {
  anthropic: { standard: "claude-haiku-4-5-20251001", deep: "claude-sonnet-5-5" },
  openai: { standard: "gpt-4o-mini", deep: "gpt-4o" },
};

export const CONDITION_VALUES: string[] = CONDITION_OPTIONS.map((o) => o.value);
// "custom" is only the dropdown's "type your own" entry, never a value the AI can pick.
export const CLEANLINESS_VALUES: string[] = CLEANLINESS_OPTIONS.map((o) => o.value).filter((v) => v !== "custom");

export function parseDepth(v: unknown): Depth {
  return v === "deep" ? "deep" : "standard";
}

// Honours the requested provider when its key is configured, otherwise falls back to whichever
// is - null means neither is, so the caller can say AI isn't set up rather than failing obscurely.
export function pickProvider(requested: unknown, env: Record<string, string | undefined> = process.env): Provider | null {
  const hasAnthropic = !!env.ANTHROPIC_API_KEY;
  const hasOpenAi = !!env.OPENAI_API_KEY;
  if (requested === "openai" && hasOpenAi) return "openai";
  if (hasAnthropic) return "anthropic";
  if (hasOpenAi) return "openai";
  return null;
}

// Only ever called with URLs the server itself read from the database - never with anything a
// browser sent - so this can't be pointed at an arbitrary address.
export async function loadImages(urls: string[]): Promise<Img[]> {
  return Promise.all(urls.filter((u) => /^https:\/\//i.test(u)).map((u) => fetchAndResizeImage(u)));
}

// Forces the model to answer by calling one tool whose input schema is the shape wanted, so the
// result comes back as structured data rather than prose that has to be parsed.
export async function callVisionTool(opts: {
  provider: Provider;
  depth: Depth;
  system: string;
  parts: Part[];
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<VisionResult> {
  const { provider, depth, system, parts, toolName, toolDescription, schema, maxTokens } = opts;
  const model = MODELS[provider][depth];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55_000);
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY || "", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system,
          tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
          tool_choice: { type: "tool", name: toolName },
          messages: [
            {
              role: "user",
              content: parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image", source: { type: "base64", media_type: p.image.mediaType, data: p.image.base64 } })),
            },
          ],
        }),
      });
      if (!res.ok) {
        console.error("Anthropic vision error:", res.status, await res.text());
        return { ok: false, status: 502, error: "AI analysis failed" };
      }
      const data = await res.json();
      if (data.stop_reason === "max_tokens") return { ok: false, status: 502, error: "The AI's answer was cut off - please try again" };
      const block = (data.content || []).find((b: any) => b?.type === "tool_use" && b?.name === toolName);
      if (!block || typeof block.input !== "object" || block.input === null || Array.isArray(block.input)) return { ok: false, status: 502, error: "The AI didn't return a usable answer - please try again" };
      return { ok: true, data: block.input };
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY || ""}` },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: parts.map((p) => (p.type === "text" ? { type: "text", text: p.text } : { type: "image_url", image_url: { url: `data:${p.image.mediaType};base64,${p.image.base64}` } })),
          },
        ],
        tools: [{ type: "function", function: { name: toolName, description: toolDescription, parameters: schema } }],
        tool_choice: { type: "function", function: { name: toolName } },
      }),
    });
    if (!res.ok) {
      console.error("OpenAI vision error:", res.status, await res.text());
      return { ok: false, status: 502, error: "AI analysis failed" };
    }
    const data = await res.json();
    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") return { ok: false, status: 502, error: "The AI's answer was cut off - please try again" };
    const args = choice?.message?.tool_calls?.[0]?.function?.arguments;
    let parsed: unknown;
    try {
      parsed = typeof args === "string" ? JSON.parse(args) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, status: 502, error: "The AI didn't return a usable answer - please try again" };
    return { ok: true, data: parsed as Record<string, unknown> };
  } catch (err) {
    if ((err as any)?.name === "AbortError") return { ok: false, status: 504, error: "The AI took too long to answer - please try again" };
    console.error("Vision call failed:", err);
    return { ok: false, status: 502, error: "AI analysis failed" };
  } finally {
    clearTimeout(timer);
  }
}

// ---- cleaning what the model sends back: it is suggestion text, never trusted as-is ----

export function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t;
}

export function pickEnum(v: unknown, allowed: readonly string[]): string | null {
  return typeof v === "string" && allowed.includes(v) ? v : null;
}

export function cleanInt(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN;
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
