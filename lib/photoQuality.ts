// A quick, local "is this photo usable evidence?" check, run in the browser as photos are picked. No AI, no network, so it
// is free, instant and works offline. It looks for the obvious problems that make an inventory photo useless in a dispute:
// too dark, washed out, out of focus, too small, or a repeat of a photo already taken.
//
// It only ever WARNS: the person can always use the photo anyway, and if anything here fails the photo is simply uploaded as
// before. Pure functions (pixels in, answers out), so the thresholds can be tested and tuned without a browser.

export type Metrics = { meanLuma: number; p05: number; p95: number; clipped: number; sharpness: number; width: number; height: number };
export type IssueKind = "dark" | "bright" | "flat" | "blurry" | "lowres" | "duplicate";
export type PhotoIssue = { kind: IssueKind; message: string };

export const ANALYSIS_LONG_SIDE = 960; // photos are shrunk to this before looking at them: fast, and big enough to see blur

// ---- thresholds (tuned on test images; see scripts/check-photo-quality.ts to tune them on real photos) -----------------
export const THRESHOLDS = {
  darkMean: 45, // average brightness below this (0-255)
  darkHigh: 90, // ... or even the brightest 5% of the picture is below this
  // "Too bright" means blown-out, not merely pale: a well-lit white or cream wall is perfectly good evidence. Blown-out is
  // when a large share of the picture is stuck at pure white, so detail is gone for good.
  clippedFraction: 0.35, // share of pixels at (almost) pure white
  brightMean: 240, // ... or the whole picture is nearly white
  flatSpread: 14, // brightest 5% minus darkest 5%: below this there is almost nothing in the picture
  sharpQuantile: 1, // 1 = judge the photo by its single sharpest spot, so a hairline crack on a plain wall counts
  sharpMin: 10, // sharpest spot below this reads as out of focus (sharp photos score hundreds; clearly blurry ones under 6)
  minSide: 600, // original photo smaller than this many pixels on its shortest side
  dupDistance: 5, // two photos this close (of 64 bits) are the same shot
} as const;

// Luminance (0-255) of an RGBA pixel buffer.
function toGray(rgba: ArrayLike<number>, w: number, h: number): Uint8Array {
  const g = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) g[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000;
  return g;
}

// Detail measure: the energy of the Laplacian (how sharply brightness changes) in each small tile of the picture, and then
// the 90th percentile across tiles. A sharp photo has strong edges SOMEWHERE (a door frame, a window, a skirting board), even
// if most of it is plain wall, so it scores high; an out-of-focus photo has no strong edges ANYWHERE. Taking a high percentile
// rather than the overall average is what stops a sharp photo of a plain wall being called blurry.
// Energy of the Laplacian (how sharply brightness changes) in each small tile of the picture, after a light smoothing.
export function tileEnergies(grayIn: Uint8Array, w: number, h: number): number[] {
  const TILE = 32;
  if (w < TILE * 2 || h < TILE * 2) return [];
  // A 3x3 average first: camera noise (common in dim rooms) looks like fine "detail" and would make a blurry photo seem sharp.
  // Real edges survive a light smoothing; random noise mostly does not. (Border pixels are left out below: they have no
  // full neighbourhood, and treating them as zero would invent a bright "edge" around every picture.)
  const sm = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; sm[i] = (grayIn[i - w - 1] + grayIn[i - w] + grayIn[i - w + 1] + grayIn[i - 1] + grayIn[i] + grayIn[i + 1] + grayIn[i + w - 1] + grayIn[i + w] + grayIn[i + w + 1]) / 9; }
  const tilesX = Math.floor(w / TILE), tilesY = Math.floor(h / TILE);
  const sums = new Float64Array(tilesX * tilesY), counts = new Uint32Array(tilesX * tilesY);
  for (let y = 2; y < h - 2; y++) {
    const ty = Math.floor(y / TILE); if (ty >= tilesY) break;
    for (let x = 2; x < w - 2; x++) {
      const tx = Math.floor(x / TILE); if (tx >= tilesX) break;
      const i = y * w + x, l = 4 * sm[i] - sm[i - 1] - sm[i + 1] - sm[i - w] - sm[i + w];
      sums[ty * tilesX + tx] += l * l; counts[ty * tilesX + tx]++;
    }
  }
  const energies: number[] = [];
  for (let t = 0; t < sums.length; t++) if (counts[t] > 0) energies.push(sums[t] / counts[t]);
  return energies.sort((a, b) => a - b);
}

// Detail measure: the energy of the sharpest tile. A sharp photo has strong edges SOMEWHERE (a door frame, a window, a crack
// in a wall), even if most of it is plain, so it scores high; an out-of-focus photo has no strong edges ANYWHERE. Judging by the
// sharpest spot, not the average or a percentile, is what stops a sharp photo of a plain wall with one hairline crack being
// called blurry. Known limit: faint, feathered damp stains are naturally soft, so a photo of one alone can read as unclear.
export function sharpness(gray: Uint8Array, w: number, h: number): number {
  const e = tileEnergies(gray, w, h);
  if (e.length === 0) return Infinity; // too small to judge: never call it blurry
  return e[Math.min(e.length - 1, Math.floor(e.length * THRESHOLDS.sharpQuantile))];
}

export function analyse(rgba: ArrayLike<number>, w: number, h: number, original: { width: number; height: number } = { width: w, height: h }): Metrics {
  const gray = toGray(rgba, w, h), hist = new Array(256).fill(0);
  let sum = 0;
  for (let i = 0; i < gray.length; i++) { hist[gray[i]]++; sum += gray[i]; }
  const pct = (q: number) => { let acc = 0; const target = gray.length * q; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; } return 255; };
  let clipped = 0;
  for (let v = 248; v < 256; v++) clipped += hist[v];
  return { meanLuma: gray.length ? sum / gray.length : 0, p05: pct(0.05), p95: pct(0.95), clipped: gray.length ? clipped / gray.length : 0, sharpness: sharpness(gray, w, h), width: original.width, height: original.height };
}

// Turns the measurements into plain-language problems. Deliberately conservative: only clear problems are reported.
export function issuesFrom(m: Metrics): PhotoIssue[] {
  const T = THRESHOLDS, out: PhotoIssue[] = [];
  const dark = m.meanLuma < T.darkMean || m.p95 < T.darkHigh, bright = m.clipped > T.clippedFraction || m.meanLuma > T.brightMean;
  if (dark) out.push({ kind: "dark", message: "too dark to see detail" });
  else if (bright) out.push({ kind: "bright", message: "too bright - detail is lost in the white" });
  else if (m.p95 - m.p05 < T.flatSpread) out.push({ kind: "flat", message: "nothing clear in the picture (lens covered, or too close)" });
  else if (m.sharpness < T.sharpMin) out.push({ kind: "blurry", message: "looks out of focus" });
  if (Math.min(m.width, m.height) < T.minSide) out.push({ kind: "lowres", message: "very low resolution" });
  return out;
}

// ---- spotting a repeat of the same shot -----------------------------------------------------------------------------
// A 64-bit "difference hash": shrink to 9x8, and record for each pixel whether it is brighter than its right neighbour. Two
// photos of the same scene give almost the same bits even after resizing or recompression.
export function dHash(rgba: ArrayLike<number>, w: number, h: number): string {
  const gray = toGray(rgba, w, h), cells = new Float64Array(72);
  for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 9; cx++) {
    const x0 = Math.floor((cx * w) / 9), x1 = Math.max(x0 + 1, Math.floor(((cx + 1) * w) / 9)), y0 = Math.floor((cy * h) / 8), y1 = Math.max(y0 + 1, Math.floor(((cy + 1) * h) / 8));
    let s = 0, n = 0;
    for (let y = y0; y < y1 && y < h; y++) for (let x = x0; x < x1 && x < w; x++) { s += gray[y * w + x]; n++; }
    cells[cy * 9 + cx] = n ? s / n : 0;
  }
  let bits = "";
  for (let cy = 0; cy < 8; cy++) {
    let nibble = 0, nb = 0;
    for (let cx = 0; cx < 8; cx++) { nibble = (nibble << 1) | (cells[cy * 9 + cx] > cells[cy * 9 + cx + 1] ? 1 : 0); if (++nb === 4) { bits += nibble.toString(16); nibble = 0; nb = 0; } }
  }
  return bits; // 16 hex characters
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { d += x & 1; x >>= 1; } }
  return d;
}
export const isDuplicate = (a: string, b: string) => hamming(a, b) <= THRESHOLDS.dupDistance;

// The repeat-photo fingerprint is only trustworthy for a picture with real detail. Two different bare walls are both "nearly
// blank", so their fingerprints are close to meaningless and can match by accident. Such a picture gets no fingerprint at all
// (it is also reported as unclear anyway), so it can never be called a repeat of something else.
export function reliableHash(m: Metrics, rgba: ArrayLike<number>, w: number, h: number): string | null {
  return m.sharpness >= THRESHOLDS.sharpMin ? dHash(rgba, w, h) : null;
}

export type PhotoCheck = { issues: PhotoIssue[]; hash: string | null; metrics: Metrics | null };

// Combines both: the problems with ONE photo, and whether it repeats an earlier one (in the same pick or already taken).
export function reviewBatch(checks: PhotoCheck[], earlierHashes: string[] = []): PhotoIssue[][] {
  const seen = [...earlierHashes];
  return checks.map((c) => {
    const issues = [...c.issues];
    if (c.hash && seen.some((h) => isDuplicate(h, c.hash!))) issues.push({ kind: "duplicate", message: "looks the same as another photo" });
    if (c.hash) seen.push(c.hash);
    return issues;
  });
}
