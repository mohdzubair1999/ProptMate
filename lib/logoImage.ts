// A company logo is stored and handled as a small PNG or JPEG "data URI". Only those two formats are accepted - never
// SVG, which can carry script - and everything about it is checked: the exact shape of the text, a size ceiling, and
// the file's own opening bytes (a file called .png that is not one is refused). The logo's proportions are read from
// the image's header, so nothing has to load the picture just to know how wide it is.

export const MAX_LOGO_CHARS = 400_000; // the whole data URI
export const MAX_LOGO_BYTES = 300_000; // the decoded image
const RE = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/;

export type LogoInfo = { dataUri: string; mime: "png" | "jpeg"; width: number; height: number; aspect: number };

function decode(b64: string): Uint8Array | null {
  try {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function pngSize(b: Uint8Array): [number, number] | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 33 || !sig.every((v, i) => b[i] === v)) return null;
  // The first chunk must be IHDR, which holds the width and height.
  if (!(b[12] === 0x49 && b[13] === 0x48 && b[14] === 0x44 && b[15] === 0x52)) return null;
  const w = ((b[16] << 24) | (b[17] << 16) | (b[18] << 8) | b[19]) >>> 0;
  const h = ((b[20] << 24) | (b[21] << 16) | (b[22] << 8) | b[23]) >>> 0;
  return [w, h];
}

function jpegSize(b: Uint8Array): [number, number] | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2) return null;
    // Start-of-frame markers carry the size.
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    }
    i += 2 + len;
  }
  return null;
}

// Returns the logo's details if (and only if) it is a genuine, reasonably small PNG or JPEG; otherwise null.
export function readLogo(dataUri: unknown): LogoInfo | null {
  if (typeof dataUri !== "string" || dataUri.length < 60 || dataUri.length > MAX_LOGO_CHARS) return null;
  const m = RE.exec(dataUri);
  if (!m) return null;
  const mime = m[1] as "png" | "jpeg";
  const bytes = decode(m[2]);
  if (!bytes || bytes.length > MAX_LOGO_BYTES || bytes.length < 30) return null;
  const size = mime === "png" ? pngSize(bytes) : jpegSize(bytes);
  if (!size) return null;
  const [width, height] = size;
  // A real logo: not a speck, not a billboard, not a strip so thin it would vanish.
  if (width < 16 || height < 16 || width > 4000 || height > 4000) return null;
  const aspect = width / height;
  if (aspect < 0.1 || aspect > 10) return null;
  return { dataUri, mime, width, height, aspect };
}
