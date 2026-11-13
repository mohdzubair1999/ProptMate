// Sorting tenants' repair reports (made by scanning the property's QR code) so the dangerous ones are seen first. It looks for WORDS AND PHRASES, not meaning: it
// cannot read a worrying message that uses unusual words, so it is a first look for a person, never a decision. It is built to err towards "more urgent":
// any emergency wording wins over everything else in the message, and a negation is not understood ("no smell of gas" is still treated as a gas report).
// Pure: no database, no screen, so every rule is tested directly.

export type Urgency = "emergency" | "urgent" | "routine";
export type Triage = { urgency: Urgency; category: string; reasons: string[] };
type Rule = { category: string; re: RegExp };

// lower case, apostrophes dropped ("won't" is "wont"), everything that is not a letter or digit becomes a space
const normalise = (s: unknown): string => String(typeof s === "string" ? s : "").slice(0, 4000).toLowerCase().replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const EMERGENCY: Rule[] = [
  { category: "Gas or carbon monoxide", re: /\bgas\b.{0,40}\b(?:smell|smells|smelling|smelt|leak|leaks|leaking|hissing|odour|odor|escaping)\b|\b(?:smell|smells|smelling|smelt|leak|leaks|leaking|hissing|odour|odor)\b.{0,40}\bgas\b|\bcarbon monoxide\b|\bco (?:alarm|detector)\b.{0,30}\b(?:going off|sounding|sounded|activated|alarming)\b/g },
  { category: "Fire or smoke", re: /\b(?:on fire|caught fire|catching fire|flames?|burning smell|smell of burning|smells of burning|smells like burning|smell burning|burning plastic|something is burning|fire in)\b|\bsmoke\b(?! (?:alarm|alarms|detector|detectors))/g },
  { category: "Electrical danger", re: /\b(?:sparks?|sparking|sparked|exposed wires?|bare wires?|live wires?|electric shock|electrocuted|got a shock|shocked me)\b|\b(?:plug|plugs|socket|sockets|fuse|fuse box|cooker|charger|lead|extension lead|kettle|toaster|heater|wiring|switch)\b.{0,25}\b(?:smoking|sparking|burning|burnt|melting|melted|scorched|scorching|hot to touch|buzzing loudly)\b|\b(?:smoking|sparking|burning|burnt|melting|melted|scorched)\s+(?:plug|plugs|socket|sockets|fuse|cooker|charger|lead|kettle|toaster|heater|wiring|switch)\b/g },
  { category: "Flooding", re: /\b(?:flood|flooded|flooding|burst pipe|pipe burst|pipe has burst|pipe is burst|gushing water|water everywhere)\b|\bwater\b.{0,15}\b(?:pouring|gushing|streaming)\b/g },
  { category: "Structural collapse", re: /\b(?:ceiling|roof|wall|floor|chimney)\b.{0,25}\b(?:collapsed|collapsing|fell down|has fallen|came down|coming down)\b|\bcollapsed (?:ceiling|roof|wall|floor|chimney)\b/g },
  { category: "Break-in", re: /\b(?:break in|broke in|broken into|burglar|burglars|burglary|burgled|intruder|squatters?)\b/g },
];
const URGENT: Rule[] = [
  { category: "Leak or water", re: /\b(?:leak|leaks|leaking|leaked|dripping|drips|dripped|water (?:coming|dripping|running|pouring|seeping|through)|wet ceiling|ceiling (?:is )?wet)\b/g },
  { category: "Heating or hot water", re: /\bno (?:heating|heat|hot water)\b|\b(?:heating|boiler|radiators?|hot water|water heater|immersion)\b.{0,30}\b(?:not working|wont work|broken|stopped|off|down|failed|fault|faulty|cold|lockout|locked out)\b|\bboiler\b.{0,30}\b(?:pressure|error|leaking|banging)\b/g },
  { category: "Electrical", re: /\bno (?:power|electric|electricity|lights|lighting)\b|\bpower (?:cut|out|outage|failure|has gone|went)\b|\b(?:tripping|trips|tripped)\b|\bblackout\b/g },
  { category: "Security (locks, doors, windows)", re: /\b(?:front|back|patio|french|garage|entrance|main|external|outside|communal|flat)\s+door\b.{0,30}\b(?:broken|broke|smashed|damaged|wont (?:lock|close|shut)|will not (?:lock|close|shut)|cant (?:lock|close|shut)|cannot (?:lock|close|shut)|jammed|stuck open|insecure|forced|kicked)\b|\b(?:lock|locks|window|windows|gate|latch|key|keys)\b.{0,30}\b(?:broken|broke|smashed|damaged|wont (?:lock|close|shut)|will not (?:lock|close|shut)|cant (?:lock|close|shut)|cannot (?:lock|close|shut)|jammed|stuck open|insecure|forced|kicked)\b|\b(?:broken|smashed|cracked|forced) (?:lock|window|glass|pane|latch)\b|\blocked out\b/g },
  { category: "Toilet or drains", re: /\b(?:toilet|wc|loo)\b.{0,30}\b(?:blocked|not flushing|wont flush|will not flush|overflowing|overflow|backing up)\b|\b(?:blocked|overflowing|backing up) (?:toilet|wc|loo|drain|drains|sewer)\b|\bsewage\b|\bsewer\b/g },
  { category: "Damp or mould", re: /\b(?:mould|mold|mildew|damp|dampness|condensation|black spots?|black patches|fungus)\b/g },
  { category: "Pests", re: /\b(?:mice|mouse|rats?|rodents?|cockroach(?:es)?|bedbugs?|bed bugs|wasps?|hornets?|infestation|infested|pests?|fleas|maggots)\b/g },
  { category: "Fire safety (alarms)", re: /\b(?:smoke|fire|heat|co|carbon monoxide)\s+(?:alarm|alarms|detector|detectors)\b.{0,40}\b(?:beeping|chirping|not working|broken|faulty|missing|keeps|dead|flat battery|silent)\b|\b(?:alarm|alarms|detector)\b.{0,25}\b(?:beeping|chirping|going off|keeps going off)\b|\bno (?:smoke|fire|co) (?:alarm|detector)\b/g },
];
const ROUTINE: Rule[] = [
  { category: "Appliances", re: /\b(?:oven|hob|cooker|fridge|freezer|washing machine|washer|dishwasher|dryer|tumble dryer|microwave|extractor|cooker hood|kettle|appliance)\b/g },
  { category: "Plumbing", re: /\b(?:tap|taps|sink|shower|bath|basin|plughole|plug hole|drain|drains|cistern|flush)\b/g },
  { category: "Doors, windows and fittings", re: /\b(?:door|doors|handle|hinge|hinges|cupboard|cupboards|drawer|shelf|shelves|curtain|blind|blinds|rail|window|windows|catch|lock|locks|worktop|unit)\b/g },
  { category: "Electrical (not urgent)", re: /\b(?:bulb|bulbs|light fitting|lamp|socket|sockets|switch|switches|plug|doorbell|intercom|light|lights)\b/g },
  { category: "External", re: /\b(?:gutter|gutters|fence|garden|shed|roof|slates?|patio|path|drive|bin store|communal)\b/g },
  { category: "Decoration and surfaces", re: /\b(?:paint|paintwork|plaster|crack|cracks|cracked|flooring|floor|carpet|laminate|tiles?|tiling|grout|skirting|wallpaper|ceiling|wall|walls|stain|scuff)\b/g },
];
// the person themselves says it is serious: enough to treat a routine-sounding report as urgent (never enough on its own to be an emergency)
const SAYS_URGENT = /\b(?:urgent|urgently|emergency|asap|immediately|dangerous|danger|unsafe|health hazard|elderly|baby|newborn|disabled|vulnerable)\b/g;

const firstMatches = (rules: Rule[], text: string): { category: string; reasons: string[] } | null => {
  for (const rule of rules) {
    const found: string[] = [];
    for (const m of text.matchAll(new RegExp(rule.re.source, "g"))) { const w = m[0].trim().slice(0, 40); if (w && !found.includes(w)) found.push(w); if (found.length >= 4) break; }
    if (found.length > 0) return { category: rule.category, reasons: found };
  }
  return null;
};

export function triageReport(description: unknown): Triage {
  const text = normalise(description);
  const e = firstMatches(EMERGENCY, text); if (e) return { urgency: "emergency", ...e };
  const u = firstMatches(URGENT, text); if (u) return { urgency: "urgent", ...u };
  const says = firstMatches([{ category: "Needs a look", re: SAYS_URGENT }], text);
  const r = firstMatches(ROUTINE, text);
  if (says) return { urgency: "urgent", category: r ? r.category : "Other", reasons: says.reasons };
  return { urgency: "routine", category: r ? r.category : "Other", reasons: r ? r.reasons : [] };
}

export const URGENCY_LABEL: Record<Urgency, string> = { emergency: "Emergency", urgent: "Urgent", routine: "Routine" };
const RANK: Record<Urgency, number> = { emergency: 0, urgent: 1, routine: 2 };

// What to do first, for the person reading an emergency
export const EMERGENCY_ADVICE = "Contact the tenant now. If anyone is in danger, call 999. For a gas smell, the National Gas Emergency Service is on 0800 111 999 (free, 24 hours).";

// Reports still open come first (most serious first, then newest first); finished ones go last (newest first). Returns a new list; the input is not changed.
export function sortReports<T extends { status: string; createdAt: string; description: string }>(reports: T[]): T[] {
  const open = (r: T) => r.status !== "resolved";
  return [...(Array.isArray(reports) ? reports : [])]
    .map((r) => ({ r, rank: RANK[triageReport(r.description).urgency], t: +new Date(r.createdAt) || 0 }))
    .sort((a, b) => (open(a.r) === open(b.r) ? 0 : open(a.r) ? -1 : 1) || (open(a.r) ? a.rank - b.rank : 0) || b.t - a.t)
    .map((x) => x.r);
}

// The maintenance job that a report would become. Emergencies and urgent reports are urgent jobs; everything else is a routine one.
export function jobFromReport(description: string, t: Triage): { urgency: "urgent" | "28-days"; timeframe: string; area: string; text: string } {
  const clean = String(description ?? "").replace(/\s+/g, " ").trim();
  const text = `${clean.slice(0, 470)}${clean.length > 470 ? "..." : ""} (reported by a tenant using the property's QR code)`;
  return t.urgency === "emergency" ? { urgency: "urgent", timeframe: "Immediately", area: t.category, text } : t.urgency === "urgent" ? { urgency: "urgent", timeframe: "As soon as possible", area: t.category, text } : { urgency: "28-days", timeframe: "Within 28 days", area: t.category, text };
}
