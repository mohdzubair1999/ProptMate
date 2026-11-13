import sharp from "sharp";

// Checking what an uploaded file REALLY is.
//
// A browser says what a file is (its "type"), but that is only a label the uploader controls. Photos and documents are
// stored publicly and served back, so a web page or script disguised as a photo is a real risk. The first bytes of a
// file say what it truly is, so that is what is checked, and the stored copy is labelled with the TRUE type.

export type FileKind = "image" | "pdf";
export type DetectedFile = { kind: FileKind; mime: string; ext: string; decodable: boolean };

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.slice(from, to));

export function detectFileType(b: Uint8Array): DetectedFile | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { kind: "image", mime: "image/jpeg", ext: "jpg", decodable: true };
  if (b[0] === 0x89 && ascii(b, 1, 4) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { kind: "image", mime: "image/png", ext: "png", decodable: true };
  if (ascii(b, 0, 4) === "GIF8" && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return { kind: "image", mime: "image/gif", ext: "gif", decodable: true };
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return { kind: "image", mime: "image/webp", ext: "webp", decodable: true };
  // iPhone photos can be HEIC and some Android photos AVIF; both are "ftyp" files. Not decoded here (not every server can),
  // but still recognised by their real signature so they are never refused by mistake.
  if (ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"].includes(brand)) return { kind: "image", mime: "image/heic", ext: "heic", decodable: false };
    if (["avif", "avis"].includes(brand)) return { kind: "image", mime: "image/avif", ext: "avif", decodable: false };
  }
  if (ascii(b, 0, 5) === "%PDF-") return { kind: "pdf", mime: "application/pdf", ext: "pdf", decodable: false };
  return null;
}

// The stored name: lowercase letters, digits and hyphens only, never a path, never an extension that disagrees with the
// contents (a web page renamed "photo.jpg" is not stored as one, and a photo named "x.html" is stored as .jpg).
export function safeFileName(name: unknown, ext: string): string {
  let base = typeof name === "string" ? name : "";
  base = base.replace(/\.[A-Za-z0-9]{1,6}$/, "");
  base = base.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "");
  return `${base || "file"}.${ext}`;
}

// Photos taken on a phone carry hidden details: the exact GPS position, the time, and the camera. They are stored publicly, so those are
// removed from the stored copy. The picture itself is not changed: it is turned the right way up (the rotation is applied, then the
// "rotate me" tag is removed), and the colour profile is KEPT so wide-gamut phone photos look the same. Only JPEG, PNG and WebP are
// cleaned; an animated GIF, a HEIC or AVIF file, or a PDF is stored as it arrived. If a JPEG, PNG or WebP cannot be cleaned, the image
// library cannot read it properly (it is damaged, for example cut short in transit), so it returns null and the upload is refused as
// damaged: storing it "as sent" would keep exactly the location data this exists to remove, in a picture that is unusable anyway.
const CLEANABLE = new Set(["image/jpeg", "image/png", "image/webp"]);
export async function stripImageMetadata(bytes: Buffer, mime: string): Promise<Buffer | null> {
  if (!CLEANABLE.has(mime)) return bytes;
  try {
    const img = sharp(bytes, { failOn: "none" }).rotate().keepIccProfile();
    const out = mime === "image/jpeg" ? await img.jpeg({ quality: 88 }).toBuffer() : mime === "image/png" ? await img.png().toBuffer() : await img.webp({ quality: 88 }).toBuffer();
    return out.length > 0 ? out : null;
  } catch (err) {
    console.error("Could not clean an uploaded photo (refused as damaged):", err);
    return null;
  }
}

// HEIC (the iPhone format) and AVIF cannot be shown by most browsers, sent to the AI or put in a report, and they carry the same GPS and camera
// details as any photo. So they are turned into a cleaned JPEG here. This server's image library can read AVIF but not HEIC (it needs a codec
// that is not included), so a HEIC it cannot open is refused with instructions rather than stored with its location details. (iPhone Safari
// already converts a HEIC to JPEG when you pick it in a web page, so in practice this is raw HEIC files chosen on a computer.)
async function toCleanJpeg(bytes: Buffer): Promise<Buffer | null> {
  try {
    const out = await sharp(bytes, { failOn: "none" }).rotate().keepIccProfile().jpeg({ quality: 88 }).toBuffer();
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
const HEIC_REFUSED = "This HEIC photo can't be read here, and keeping it would keep its location details. Please upload it as a JPEG (on an iPhone: Settings, Camera, Formats, Most Compatible) or take the photo again.";

export type UploadRead = { ok: true; bytes: Buffer; type: DetectedFile } | { ok: false; status: number; error: string };

export async function readUpload(file: unknown, opts: { allow: FileKind[]; maxBytes: number }): Promise<UploadRead> {
  const f = file as { size?: unknown; arrayBuffer?: unknown } | null;
  if (!f || typeof f !== "object" || typeof f.arrayBuffer !== "function" || typeof f.size !== "number") return { ok: false, status: 400, error: "No file was provided" };
  if (f.size === 0) return { ok: false, status: 400, error: "No file was provided" };
  const mb = Math.round(opts.maxBytes / (1024 * 1024));
  if (f.size > opts.maxBytes) return { ok: false, status: 413, error: `That file is too large - please use one under ${mb} MB` };
  const bytes = Buffer.from(await (f as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer());
  if (bytes.length > opts.maxBytes) return { ok: false, status: 413, error: `That file is too large - please use one under ${mb} MB` };
  const type = detectFileType(bytes);
  if (!type || !opts.allow.includes(type.kind)) {
    const wanted = opts.allow.length === 1 && opts.allow[0] === "image" ? "a photo or image" : "a PDF or an image";
    return { ok: false, status: 415, error: `That doesn't look like ${wanted}. Please choose a real photo or document file.` };
  }
  if (type.kind === "image" && (type.mime === "image/heic" || type.mime === "image/avif")) {
    const jpeg = await toCleanJpeg(bytes);
    if (!jpeg) return { ok: false, status: 415, error: type.mime === "image/heic" ? HEIC_REFUSED : "That image file looks damaged. Please try a different photo." };
    return { ok: true, bytes: jpeg, type: { kind: "image", mime: "image/jpeg", ext: "jpg", decodable: true } };
  }
  // for formats we can open, make sure the file really opens (a web page with a photo's first bytes in front of it does not)
  if (type.kind === "image" && type.decodable) {
    try {
      const md = await sharp(bytes).metadata();
      if (!md.width || !md.height) throw new Error("no size");
    } catch {
      return { ok: false, status: 415, error: "That image file looks damaged. Please try a different photo." };
    }
  }
  if (type.kind === "image" && type.decodable) {
    const cleaned = await stripImageMetadata(bytes, type.mime);
    if (!cleaned) return { ok: false, status: 415, error: "That image file looks damaged. Please try a different photo." };
    return { ok: true, bytes: cleaned, type };
  }
  return { ok: true, bytes, type };
}
