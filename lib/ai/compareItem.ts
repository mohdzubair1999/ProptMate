import { CONFIDENCES, SEVERITIES } from "./assessItem";
import { cleanText, pickEnum } from "./vision";

import { CHANGE_KINDS, type ChangeKind } from "@/lib/changeKinds";
export { CHANGE_KINDS, CHANGE_LABELS, needsReview, type ChangeKind } from "@/lib/changeKinds";

export const COMPARE_SYSTEM =
  "You are helping a UK property inspector complete a check-out. You are shown photos of ONE item or area taken at CHECK-IN, then photos of the same item taken at CHECK-OUT. Say what has visibly changed between them. You are assisting: the inspector will look at both sets of photos before relying on you.\n\n" +
  "Rules:\n" +
  "- Report only differences you can actually see in the photos. Never report a difference that could just be lighting, angle, distance, focus or colour balance.\n" +
  "- If the two sets do not show the same part of the item, or the photos are too poor to compare, choose cannot_compare and say why. Never guess.\n" +
  "- Be factual. Describe what is visible and where. Do not say who caused it, do not recommend repairs or actions, do not say anything is 'not tested'.\n" +
  "- Normal ageing is not a change worth flagging: choose no_change when the item looks the same apart from very slight wear.\n" +
  "- British English, short plain sentences.\n\n" +
  "Choose exactly one overall kind:\n" +
  "no_change: looks the same.\n" +
  "new_mark: a new mark, scuff, scratch or stain that was not there at check-in.\n" +
  "worse: something already there at check-in has got noticeably worse (a bigger stain, a longer crack).\n" +
  "missing: something visible at check-in is no longer there.\n" +
  "damage: new damage - a chip, crack, hole, burn, breakage.\n" +
  "dirtier: clearly less clean than at check-in.\n" +
  "better: clearly better than at check-in.\n" +
  "cannot_compare: the photos cannot be compared reliably.\n" +
  "If more than one applies, choose the most serious and list each one in findings.";

export const COMPARE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: [...CHANGE_KINDS] },
    summary: { type: "string", description: "One to three short factual sentences saying what changed, or that nothing visibly has." },
    findings: {
      type: "array",
      items: {
        type: "object",
        properties: { what: { type: "string" }, where: { type: "string" }, severity: { type: "string", enum: SEVERITIES } },
        required: ["what"],
      },
    },
    confidence: { type: "string", enum: CONFIDENCES },
  },
  required: ["kind", "summary", "confidence"],
};

export type Comparison = { kind: ChangeKind; summary: string; findings: { what: string; where: string | null; severity: string }[]; severity: string | null; confidence: string };

const RANK: Record<string, number> = { minor: 1, moderate: 2, major: 3 };

// Checks and trims what the model sent. Anything unknown is dropped; a missing kind or summary means the answer is unusable (null).
export function normaliseComparison(raw: Record<string, unknown> | null | undefined): Comparison | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = pickEnum(raw.kind, CHANGE_KINDS) as ChangeKind | null;
  const summary = cleanText(raw.summary, 500);
  if (!kind || !summary) return null;
  const findings: Comparison["findings"] = [];
  for (const f of Array.isArray(raw.findings) ? raw.findings : []) {
    if (!f || typeof f !== "object") continue;
    const what = cleanText((f as any).what, 200);
    if (!what) continue;
    findings.push({ what, where: cleanText((f as any).where, 80), severity: pickEnum((f as any).severity, SEVERITIES) ?? "minor" });
    if (findings.length >= 6) break;
  }
  const confidence = pickEnum(raw.confidence, CONFIDENCES) ?? "low";
  const flagged = kind !== "no_change" && kind !== "better" && kind !== "cannot_compare";
  const top = findings.reduce((m, f) => Math.max(m, RANK[f.severity] ?? 1), 0);
  return { kind, summary, findings: flagged ? findings : [], severity: flagged ? (Object.keys(RANK).find((k) => RANK[k] === (top || 1)) ?? "minor") : null, confidence };
}
