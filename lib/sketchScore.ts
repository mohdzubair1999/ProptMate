// Measures how close a sketch reading is to the truth. Used by scripts/eval-sketch-accuracy.ts, so accuracy can be
// MEASURED on real sketches instead of guessed. Pure functions, covered by tests.

export type TruthRoom = { name: string; widthM: number; lengthM: number; connectsTo?: string[] };
export type PredRoom = { name: string; widthM: number; lengthM: number; connectsTo?: string[]; sizeSource?: string };
export type PairScore = { truth: string; pred: string; shortErrPct: number; longErrPct: number; areaErrPct: number; source: string };
export type SketchScore = {
  truthRooms: number;
  predRooms: number;
  matched: number;
  missed: string[];
  extra: string[];
  pairs: PairScore[];
  totalAreaErrPct: number | null;
  adjacency: { tp: number; fp: number; fn: number; precision: number | null; recall: number | null };
};

const SYNONYMS: [RegExp, string][] = [
  [/^(livingroom|lounge|sittingroom|reception|receptionroom|frontroom|drawingroom|familyroom)(\d*)$/, "living$2"],
  [/^(hallway|entrancehall|hall)(\d*)$/, "hall$2"],
  [/^(wc|toilet|cloakroom|cloaks|downstairswc|guestwc)(\d*)$/, "wc$2"],
  [/^(masterbedroom|mainbedroom)$/, "bedroom1"],
  [/^(bathroom|familybathroom|shower|showerroom)(\d*)$/, "bathroom$2"],
  [/^(kitchen)(\d*)$/, "kitchen$2"],
];
// "Living Room", "lounge" and "Reception" are the same room; "Bedroom 1" and "Bedroom 2" are not.
export function normaliseName(n: string): string {
  let t = String(n ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [re, to] of SYNONYMS) if (re.test(t)) { t = t.replace(re, to); break; }
  return t;
}

const pct = (pred: number, truth: number) => (truth > 0 ? (Math.abs(pred - truth) / truth) * 100 : NaN);
const area = (r: { widthM: number; lengthM: number }) => r.widthM * r.lengthM;

// Pairs each true room with a predicted one: first by name, then by closest area for whatever is left (a sketch
// labelled "Lounge" that the model called "Living room" still counts). One-to-one.
export function matchRooms(truth: TruthRoom[], pred: PredRoom[]): { pairs: [number, number][]; missed: number[]; extra: number[] } {
  const pairs: [number, number][] = [];
  const usedT = new Set<number>(), usedP = new Set<number>();
  truth.forEach((t, ti) => {
    const key = normaliseName(t.name);
    const pi = pred.findIndex((p, i) => !usedP.has(i) && normaliseName(p.name) === key);
    if (pi >= 0) { pairs.push([ti, pi]); usedT.add(ti); usedP.add(pi); }
  });
  const cands: { ti: number; pi: number; d: number }[] = [];
  truth.forEach((t, ti) => pred.forEach((p, pi) => {
    if (usedT.has(ti) || usedP.has(pi)) return;
    const ratio = area(p) / area(t);
    if (ratio >= 0.6 && ratio <= 1 / 0.6) cands.push({ ti, pi, d: Math.abs(Math.log(ratio)) });
  }));
  cands.sort((a, b) => a.d - b.d);
  for (const c of cands) {
    if (usedT.has(c.ti) || usedP.has(c.pi)) continue;
    pairs.push([c.ti, c.pi]); usedT.add(c.ti); usedP.add(c.pi);
  }
  return { pairs, missed: truth.map((_, i) => i).filter((i) => !usedT.has(i)), extra: pred.map((_, i) => i).filter((i) => !usedP.has(i)) };
}

export function scoreSketch(truth: TruthRoom[], pred: PredRoom[]): SketchScore {
  const { pairs, missed, extra } = matchRooms(truth, pred);
  const scored: PairScore[] = pairs.map(([ti, pi]) => {
    const t = truth[ti], p = pred[pi];
    // compare short side with short side and long with long, so a room the model drew rotated is not marked wrong
    const [ts, tl] = [Math.min(t.widthM, t.lengthM), Math.max(t.widthM, t.lengthM)];
    const [ps, pl] = [Math.min(p.widthM, p.lengthM), Math.max(p.widthM, p.lengthM)];
    return { truth: t.name, pred: p.name, shortErrPct: pct(ps, ts), longErrPct: pct(pl, tl), areaErrPct: pct(area(p), area(t)), source: p.sizeSource ?? "unknown" };
  });
  const tTotal = pairs.reduce((s, [ti]) => s + area(truth[ti]), 0), pTotal = pairs.reduce((s, [, pi]) => s + area(pred[pi]), 0);
  // doors: judged only between rooms that were matched, as sets of unordered pairs
  const key = (a: string, b: string) => [normaliseName(a), normaliseName(b)].sort().join("|");
  const tPairs = new Set<string>(), pPairs = new Set<string>();
  const matchedT = new Set(pairs.map(([ti]) => normaliseName(truth[ti].name))), matchedP = new Map(pairs.map(([ti, pi]) => [normaliseName(pred[pi].name), normaliseName(truth[ti].name)]));
  truth.forEach((t) => (t.connectsTo ?? []).forEach((o) => { if (matchedT.has(normaliseName(t.name)) && matchedT.has(normaliseName(o))) tPairs.add(key(t.name, o)); }));
  pred.forEach((p) => (p.connectsTo ?? []).forEach((o) => {
    const a = matchedP.get(normaliseName(p.name)), b = matchedP.get(normaliseName(o));
    if (a && b) pPairs.add([a, b].sort().join("|"));
  }));
  const tp = [...pPairs].filter((k) => tPairs.has(k)).length, fp = pPairs.size - tp, fn = tPairs.size - tp;
  return {
    truthRooms: truth.length, predRooms: pred.length, matched: pairs.length,
    missed: missed.map((i) => truth[i].name), extra: extra.map((i) => pred[i].name), pairs: scored,
    totalAreaErrPct: tTotal > 0 ? pct(pTotal, tTotal) : null,
    adjacency: { tp, fp, fn, precision: tp + fp > 0 ? tp / (tp + fp) : null, recall: tp + fn > 0 ? tp / (tp + fn) : null },
  };
}

const median = (a: number[]) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
export type Summary = { sketches: number; rooms: number; detected: number; detectionRate: number | null; sides: number; medianSideErrPct: number | null; meanSideErrPct: number | null; within5: number | null; within10: number | null; within20: number | null; meanTotalAreaErrPct: number | null; doorPrecision: number | null; doorRecall: number | null };

export function summarise(scores: SketchScore[], only?: (p: PairScore) => boolean): Summary {
  const pairs = scores.flatMap((s) => s.pairs).filter((p) => !only || only(p));
  const sides = pairs.flatMap((p) => [p.shortErrPct, p.longErrPct]).filter((x) => Number.isFinite(x));
  const share = (limit: number) => (sides.length ? sides.filter((e) => e <= limit).length / sides.length : null);
  const tp = scores.reduce((s, x) => s + x.adjacency.tp, 0), fp = scores.reduce((s, x) => s + x.adjacency.fp, 0), fn = scores.reduce((s, x) => s + x.adjacency.fn, 0);
  const rooms = scores.reduce((s, x) => s + x.truthRooms, 0), detected = scores.reduce((s, x) => s + x.matched, 0);
  return {
    sketches: scores.length, rooms, detected, detectionRate: rooms ? detected / rooms : null, sides: sides.length,
    medianSideErrPct: median(sides), meanSideErrPct: mean(sides), within5: share(5), within10: share(10), within20: share(20),
    meanTotalAreaErrPct: mean(scores.map((s) => s.totalAreaErrPct).filter((x): x is number => x !== null && Number.isFinite(x))),
    doorPrecision: tp + fp ? tp / (tp + fp) : null, doorRecall: tp + fn ? tp / (tp + fn) : null,
  };
}
