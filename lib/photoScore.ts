// Measures how well photo descriptions match what a person knows is in the photos. Used by scripts/eval-photo-analysis.ts,
// so accuracy can be MEASURED on real photos instead of guessed. Pure functions, covered by tests.
import { findWordingBreaches, clarifyMarkers, type Breach } from "@/lib/photoWording";
import { normaliseName } from "@/lib/sketchScore";

export type PhotoCase = {
  name: string;
  photos: string[];
  // For a check-out: photos of the same item from the check-in (up to 3 are used), so the comparison can be measured
  checkInPhotos?: string[];
  // inventory = check-in/check-out (facts only); maintenance = mid-term and similar (advice allowed)
  mode: "inventory" | "maintenance";
  identifyRoom?: boolean;
  context?: string;
  existingNotes?: string;
  expect: {
    // Each inner list is one thing that MUST be mentioned, with the words that would count: ["crack*", "split"] is met by
    // "cracked", "cracking" or "split". A trailing * matches any ending.
    mentions?: string[][];
    // Things that must NOT be claimed (invented causes, defects that are not there): ["burst", "flood*"]
    absent?: string[][];
    // true: the photo shows nothing wrong, so the description should not report a defect
    clean?: boolean;
    // true (with checkInPhotos): nothing has changed since check-in, so the description must not report a change
    noChange?: boolean;
    // for identifyRoom: the rooms the photos are really of
    rooms?: string[];
  };
};

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function hasTerm(text: string, term: string): boolean {
  const stem = term.endsWith("*");
  const body = esc(stem ? term.slice(0, -1) : term).replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${body}${stem ? "\\w*" : "\\b"}`, "i").test(text);
}
export const groupHit = (text: string, group: string[]) => group.some((t) => hasTerm(text, t));

const DEFECT_WORDS = ["crack*", "stain*", "damag*", "mould", "mold", "damp", "chip*", "scratch*", "dent*", "burn*", "tear", "torn", "broken", "missing", "hole*", "leak*", "peeling", "worn", "discolour*", "scuff*", "rust*", "warp*", "loose", "blister*", "limescale", "mildew"];
const NEGATION = /\b(?:no|nothing|none|without|free (?:from|of)|not (?:visible|evident|apparent)|absence|clear of|no sign)\b/i;
const sentencesOf = (t: string) => t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

// A photo marked clean must not be described as having a defect. Sentences that deny a defect ("no visible damage") are not counted.
export function reportsDefect(text: string): string[] {
  const found: string[] = [];
  for (const s of sentencesOf(text)) {
    if (NEGATION.test(s)) continue;
    for (const w of DEFECT_WORDS) if (hasTerm(s, w) && !found.includes(w)) found.push(w);
  }
  return found;
}

// When nothing has changed since check-in, the description should say so (or at least not report a change). A sentence that
// states no change is fine; a sentence that reports a defect or a difference is a false alarm.
const SAYS_NO_CHANGE = /\b(?:no (?:visible |apparent |noticeable )?(?:change|difference|differences|changes)|unchanged|not changed|looks? (?:the )?same|same (?:condition )?as (?:at )?check-?in|no (?:new|further) (?:damage|marks?|wear)|(?:was|were|is|are) (?:already )?(?:present|there|visible|recorded|noted|seen) (?:at|in|on) (?:the )?check-?in|already (?:present|there|recorded|noted|visible)|as (?:at|in) check-?in)\b/i;
const SAYS_CHANGE = /\b(?:new (?:mark|marks|damage|stain|stains|scratch|scratches|crack|cracks|chip|chips|dent|dents|burn|burns|hole|holes)|has (?:changed|worsened|deteriorated)|worse than|more (?:worn|damaged|stained)|now (?:has|shows|damaged|stained|cracked|chipped|missing)|missing since|not present at check-?in|was not (?:there|present) at check-?in|different from (?:the )?check-?in)\b/i;
export function reportsChange(text: string): string[] {
  const found: string[] = [];
  for (const s of sentencesOf(text)) {
    if (SAYS_NO_CHANGE.test(s) || NEGATION.test(s)) continue;
    const m = s.match(SAYS_CHANGE);
    if (m && !found.includes(m[0].toLowerCase())) found.push(m[0].toLowerCase());
    for (const w of DEFECT_WORDS) if (hasTerm(s, w) && /check-?in|since|now|new\b/i.test(s) && !found.includes(w)) found.push(w);
  }
  return found;
}

export function roomsIn(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) { const r = line.slice(0, i).trim(); if (r && r.length <= 40) out.push(r); }
  }
  return out;
}

export type CaseScore = {
  name: string; mode: PhotoCase["mode"];
  mentionsTotal: number; mentionsHit: number; missed: string[][];
  trapsHit: string[]; trapCases: boolean;
  isClean: boolean; falseAlarm: string[];
  noChangeExpected: boolean; falseChange: string[];
  roomsTotal: number; roomsHit: number;
  breaches: Breach[]; clarify: number; words: number; truncated: boolean; rewritten: boolean;
};

export function scoreCase(c: PhotoCase, output: { description: string; wasTruncated?: boolean; rewritten?: boolean }): CaseScore {
  const text = output.description;
  const mentions = c.expect.mentions ?? [], absent = c.expect.absent ?? [];
  const missed = mentions.filter((g) => !groupHit(text, g));
  const trapsHit = absent.filter((g) => groupHit(text, g)).map((g) => g.join("/"));
  const isClean = !!c.expect.clean;
  const detected = new Set(roomsIn(text).map(normaliseName));
  const rooms = c.expect.rooms ?? [];
  return {
    name: c.name, mode: c.mode,
    mentionsTotal: mentions.length, mentionsHit: mentions.length - missed.length, missed,
    trapsHit, trapCases: absent.length > 0,
    isClean, falseAlarm: isClean ? reportsDefect(text) : [],
    noChangeExpected: !!c.expect.noChange, falseChange: c.expect.noChange ? reportsChange(text) : [],
    roomsTotal: rooms.length, roomsHit: rooms.filter((r) => detected.has(normaliseName(r))).length,
    breaches: findWordingBreaches(text, { allowRecommendations: c.mode === "maintenance" }),
    clarify: clarifyMarkers(text).length, words: text.split(/\s+/).filter(Boolean).length,
    truncated: !!output.wasTruncated, rewritten: !!output.rewritten,
  };
}

const frac = (a: number, b: number) => (b > 0 ? a / b : null);
export type PhotoSummary = {
  cases: number; recall: number | null; perfect: number | null; trapRate: number | null; falseAlarmRate: number | null; falseChangeRate: number | null;
  advicePassedThrough: number | null; rewriteRate: number | null; roomAccuracy: number | null; avgWords: number | null; truncatedRate: number | null; asksQuestions: number | null;
};
export function summarisePhotos(scores: CaseScore[]): PhotoSummary {
  const withMentions = scores.filter((s) => s.mentionsTotal > 0);
  const perfect = scores.filter((s) => s.missed.length === 0 && s.trapsHit.length === 0 && s.falseAlarm.length === 0 && s.falseChange.length === 0 && (s.roomsTotal === 0 || s.roomsHit === s.roomsTotal));
  const traps = scores.filter((s) => s.trapCases), clean = scores.filter((s) => s.isClean), unchanged = scores.filter((s) => s.noChangeExpected), inv = scores.filter((s) => s.mode === "inventory");
  return {
    cases: scores.length,
    recall: frac(withMentions.reduce((n, s) => n + s.mentionsHit, 0), withMentions.reduce((n, s) => n + s.mentionsTotal, 0)),
    perfect: frac(perfect.length, scores.length),
    trapRate: frac(traps.filter((s) => s.trapsHit.length > 0).length, traps.length),
    falseAlarmRate: frac(clean.filter((s) => s.falseAlarm.length > 0).length, clean.length),
    falseChangeRate: frac(unchanged.filter((s) => s.falseChange.length > 0).length, unchanged.length),
    advicePassedThrough: frac(inv.filter((s) => s.breaches.length > 0).length, inv.length),
    rewriteRate: frac(inv.filter((s) => s.rewritten).length, inv.length),
    roomAccuracy: frac(scores.reduce((n, s) => n + s.roomsHit, 0), scores.reduce((n, s) => n + s.roomsTotal, 0)),
    avgWords: scores.length ? scores.reduce((n, s) => n + s.words, 0) / scores.length : null,
    truncatedRate: frac(scores.filter((s) => s.truncated).length, scores.length),
    asksQuestions: frac(scores.filter((s) => s.clarify > 0).length, scores.length),
  };
}
