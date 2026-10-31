// Tries the photo quality checks on YOUR photos, so the thresholds can be judged on real pictures, not just test images.
//
//   npx tsx@4.23.15 scripts/check-photo-quality.ts ~/Desktop/some-photos        (a folder of photos)
//   npx tsx@4.23.15 scripts/check-photo-quality.ts photo1.jpg photo2.jpg        (or individual files)
//
// For each photo it prints what the upload screen would say, plus the raw numbers behind it. If good photos are being
// flagged, or blurry ones are not, send me the output (with which photos were which) and the thresholds in
// lib/photoQuality.ts can be adjusted. Nothing is uploaded; everything stays on your computer.
import { readdirSync, statSync } from "fs";
import { extname, join } from "path";
import sharp from "sharp";
import { ANALYSIS_LONG_SIDE, THRESHOLDS, analyse, hamming, issuesFrom, reliableHash } from "../lib/photoQuality";

const IMAGE = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".tif", ".tiff"]);

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (args.length === 0) throw new Error("Give a folder of photos, or some photo files. Example: npx tsx@4.23.15 scripts/check-photo-quality.ts ~/Desktop/some-photos");
  const files: string[] = [];
  for (const a of args) {
    let s;
    try { s = statSync(a); } catch { console.log(`Skipping ${a}: not found.`); continue; }
    if (s.isDirectory()) for (const f of readdirSync(a).sort()) { if (IMAGE.has(extname(f).toLowerCase())) files.push(join(a, f)); }
    else files.push(a);
  }
  if (files.length === 0) throw new Error("No photos found there. It looks for .jpg, .png, .webp, .heic and similar files.");

  console.log(`Thresholds: blurry below ${THRESHOLDS.sharpMin}, dark below mean ${THRESHOLDS.darkMean}, blown-out above ${THRESHOLDS.clippedFraction * 100}% pure white, low resolution under ${THRESHOLDS.minSide}px, repeats within ${THRESHOLDS.dupDistance} bits\n`);
  let flagged = 0, scored = 0;
  const hashes: { file: string; hash: string }[] = [];
  for (const file of files) {
    try {
      const meta = await sharp(file, { failOn: "none" }).rotate().metadata();
      const { data, info } = await sharp(file, { failOn: "none" }).rotate().resize({ width: ANALYSIS_LONG_SIDE, height: ANALYSIS_LONG_SIDE, fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const m = analyse(data, info.width, info.height, { width: meta.width ?? info.width, height: meta.height ?? info.height });
      const issues = issuesFrom(m), hash = reliableHash(m, data, info.width, info.height);
      const repeat = hash ? hashes.find((h) => hamming(h.hash, hash) <= THRESHOLDS.dupDistance) : undefined;
      if (repeat) issues.push({ kind: "duplicate", message: `looks the same as ${repeat.file.split("/").pop()}` });
      if (hash) hashes.push({ file, hash });
      scored++;
      if (issues.length) flagged++;
      const name = file.split("/").pop()!.padEnd(34).slice(0, 34);
      console.log(`${name} ${issues.length ? "FLAGGED: " + issues.map((i) => i.message).join("; ") : "ok".padEnd(8)}`.padEnd(100), `| sharpest ${m.sharpness === Infinity ? "n/a" : m.sharpness.toFixed(1)}, brightness ${m.meanLuma.toFixed(0)}, white ${(m.clipped * 100).toFixed(0)}%, ${m.width}x${m.height}`);
    } catch {
      console.log(`${file.split("/").pop()}: could not be read here (the upload screen would let it through).`);
    }
  }
  console.log(`\n${scored} photo(s) checked, ${flagged} flagged (${scored ? Math.round((flagged / scored) * 100) : 0}%).`);
  console.log("If you see good photos flagged, or clearly bad ones passing, note their file names and send me this output.");
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
