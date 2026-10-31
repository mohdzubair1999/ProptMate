import type { LabelSuggestion, MeterSuggestion } from "@/lib/readingAssess";

// Scoring the meter and label readers against photos whose truth is known. The number that matters most is how often a WRONG value
// is offered: a reading the AI declines costs the inspector a few seconds; a wrong one can become a billing dispute.

export type ReadingCase = {
  name: string;
  kind: "meter" | "label";
  photos: string[];
  // meter: reading = the exact main digits ("01234"); unreadable = true when NO reading should be offered (blurry, partly hidden, dial)
  // label: model / brand / serial as printed; unreadable = true when nothing should be offered
  expect: { reading?: string; serial?: string; unreadable?: boolean; brand?: string; model?: string };
};
export type ReadingScore = {
  name: string;
  kind: "meter" | "label";
  offered: boolean; // a reading (or a make) was offered at all
  correct: boolean | null; // what was offered matches the truth (null when nothing was offered or nothing was expected)
  wrongOffered: boolean; // the dangerous one: something WRONG was offered
  missed: boolean; // a clear one was expected but nothing was offered (cautious, not dangerous)
  serialWrong: boolean;
};

const norm = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/[\s\-/.]/g, "");

export function scoreMeter(c: ReadingCase, s: MeterSuggestion): ReadingScore {
  const offered = s.reading !== null;
  const wrongOffered = offered && (c.expect.unreadable === true || (c.expect.reading !== undefined && s.reading !== c.expect.reading));
  return {
    name: c.name, kind: "meter", offered,
    correct: offered && c.expect.reading !== undefined ? s.reading === c.expect.reading : null,
    wrongOffered,
    missed: !offered && c.expect.reading !== undefined && c.expect.unreadable !== true,
    serialWrong: !!s.serial && c.expect.serial !== undefined && norm(s.serial) !== norm(c.expect.serial),
  };
}
export function scoreLabel(c: ReadingCase, s: LabelSuggestion): ReadingScore {
  const offered = s.make !== null;
  const modelWrong = !!s.model && c.expect.model !== undefined && norm(s.model) !== norm(c.expect.model);
  const brandWrong = !!s.brand && c.expect.brand !== undefined && norm(s.brand) !== norm(c.expect.brand);
  const wrongOffered = offered && (c.expect.unreadable === true || modelWrong || brandWrong);
  return {
    name: c.name, kind: "label", offered,
    correct: offered && (c.expect.model !== undefined || c.expect.brand !== undefined) ? !modelWrong && !brandWrong : null,
    wrongOffered,
    missed: !offered && c.expect.unreadable !== true && (c.expect.model !== undefined || c.expect.brand !== undefined),
    serialWrong: !!s.serial && c.expect.serial !== undefined && norm(s.serial) !== norm(c.expect.serial),
  };
}
export type ReadingSummary = { answers: number; wrongOffered: number; serialWrong: number; correctOfOffered: number | null; offeredShare: number | null; missed: number };
export function summariseReadings(scores: ReadingScore[]): ReadingSummary {
  const offered = scores.filter((s) => s.offered), judged = offered.filter((s) => s.correct !== null);
  return {
    answers: scores.length,
    wrongOffered: scores.filter((s) => s.wrongOffered).length,
    serialWrong: scores.filter((s) => s.serialWrong).length,
    correctOfOffered: judged.length ? judged.filter((s) => s.correct).length / judged.length : null,
    offeredShare: scores.length ? offered.length / scores.length : null,
    missed: scores.filter((s) => s.missed).length,
  };
}
