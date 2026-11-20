// A tiny, anonymous "how is the AI doing in real use?" signal. When an assistant shows a suggestion, and when the person uses it, one
// line is written to the server log (see app/api/ai/outcome/route.ts): which feature, what happened, how confident it was. No photos,
// no text, no names, no inspection ids. It never blocks or breaks anything: if it cannot be sent, nothing happens.
export type AiFeature = "damp_assessment" | "meter_reading" | "label_reading";
export type AiAction = "shown_offered" | "shown_declined" | "used" | "used_all" | "copied";
export type AiConfidence = "high" | "medium" | "low";
export function reportAiOutcome(feature: AiFeature, action: AiAction, confidence?: AiConfidence): void {
  try {
    void fetch("/api/ai/outcome", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ feature, action, ...(confidence ? { confidence } : {}) }), keepalive: true }).catch(() => {});
  } catch {
    /* never in the way */
  }
}
