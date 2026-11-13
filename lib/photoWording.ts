// Enforcing the report-wording rules in CODE, not just in the instructions given to the AI.
//
// An inventory (check-in or check-out) is a factual record. It must not tell the reader what to do about a defect
// ("should be replaced", "recommend repair"), and it must never say something was "not tested". The AI is told this,
// but an instruction is not a guarantee, so every answer is checked here and, if it breaks a rule, rewritten once.

export type Breach = { rule: "recommendation" | "not-tested"; phrase: string; sentence: string };

const RECOMMENDATION: RegExp[] = [
  /\brecommend(?:ed|s|ation|ations|ing)?\b/i,
  /\bshould\s+(?:be|have|get|also|ideally|probably|consider|ensure)\b/i,
  /\b(?:needs?|requires?)\s+(?:to\s+be\s+)?(?:urgent(?:ly)?|immediate(?:ly)?|further|professional|specialist|on-?site|repair|repaired|replac\w*|fix\w*|clean\w*|attention|treatment|maintenance|re-?seal\w*|re-?grout\w*|redecorat\w*|renew\w*|investigat\w*|inspect\w*|looking|attending|addressing|resolving)\b/i,
  /\bmust\s+be\b/i,
  /\b(?:advis(?:e|ed|able)|suggest(?:ed|s|ion|ions)?|ought to|would benefit|benefit(?:s)? from)\b/i,
  /\b(?:worth|best)\s+(?:replacing|repairing|fixing|renewing|treating|resealing|cleaning)\b/i,
  /\bconsider\s+(?:replacing|repairing|fixing|renewing|treating|cleaning|resealing)\b/i,
  /\b(?:repair|replacement|cleaning|attention|treatment|maintenance|investigation|action|resealing|redecoration)\s+(?:is\s+|are\s+)?(?:needed|required|recommended|advised|advisable|necessary)\b/i,
  /\b(?:is|are)\s+(?:needed|recommended|advisable|advised|necessary)\b/i,
];
const NOT_TESTED: RegExp[] = [
  /\b(?:not|never|wasn['\u2019]?t|weren['\u2019]?t|isn['\u2019]?t|aren['\u2019]?t|hasn['\u2019]?t|haven['\u2019]?t)\s+(?:been\s+|being\s+)?(?:tested|checked|verified|inspected|operated)\b/i,
  /\b(?:untested|unchecked|unverified)\b/i,
  /\bunable to (?:be\s+)?(?:test(?:ed)?|check(?:ed)?|verif(?:y|ied)|operat(?:e|ed))\b/i,
  /\b(?:can['\u2019]?t|cannot|can\s+not|couldn['\u2019]?t|could\s+not)\s+(?:be\s+)?(?:tested|checked|verified|operated)\b/i,
  /\bno (?:test|testing|check|checking) (?:was|has been|were) (?:carried out|done|performed|possible)\b/i,
];

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

// allowRecommendations is true for mid-term, HMO, legionella and maintenance inspections, where advice is wanted.
// "Not tested" is a rule for inventories only, so it is checked only when recommendations are NOT allowed.
export function findWordingBreaches(text: string, opts: { allowRecommendations: boolean }): Breach[] {
  if (opts.allowRecommendations) return [];
  const out: Breach[] = [];
  const seen = new Set<string>();
  for (const sentence of sentences(text)) {
    for (const [rule, list] of [["recommendation", RECOMMENDATION], ["not-tested", NOT_TESTED]] as const) {
      for (const re of list) {
        const m = sentence.match(re);
        if (m) {
          const key = `${rule}|${m[0].toLowerCase()}|${sentence}`;
          if (!seen.has(key)) { seen.add(key); out.push({ rule, phrase: m[0], sentence }); }
          break;
        }
      }
    }
  }
  return out;
}

// [CLARIFY: ...] questions are shown to the inspector as prompts to answer, so a rewrite must keep every one of them.
export const clarifyMarkers = (text: string): string[] => text.match(/\[CLARIFY:[^\]]*\]/g) ?? [];
