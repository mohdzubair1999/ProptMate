import sharp from "sharp";

// Detail crops. The AI is shown each photo shrunk to 1568 pixels on its longest side, so on a full-resolution phone photo (about 4000
// pixels wide) a hairline crack, a small mark or a printed label can disappear in the shrinking. For a large photo this cuts it into four
// overlapping quarters, each shown at close to its true size, so those details are still there to be seen. A photo that is already small
// enough to be shown whole gets no crops. Never throws: if anything goes wrong there are simply no crops.

export type Tile = { label: string; base64: string; mediaType: string };
export const TILE_TRIGGER_PX = 1900; // a photo with both sides at or below this already reaches the AI at (nearly) full detail
export const TILE_MAX_SIDE = 1568;
export const TILE_OVERLAP = 0.12; // each crop reaches this far into its neighbours, so something on a seam is whole in at least one
const MAX_PIXELS = 100_000_000; // refuse absurdly large images rather than risk the server's memory

const NAMES = ["top left", "top right", "bottom left", "bottom right"];

export async function makeTiles(buffer: Buffer): Promise<Tile[]> {
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    if (!meta.width || !meta.height) return [];
    // phones store photos sideways with a tag: the sides swap once the photo is turned upright
    const turned = (meta.orientation ?? 1) >= 5;
    const W = turned ? meta.height : meta.width, H = turned ? meta.width : meta.height;
    if (W * H > MAX_PIXELS || (W <= TILE_TRIGGER_PX && H <= TILE_TRIGGER_PX)) return [];
    const tw = Math.min(W, Math.ceil((W / 2) * (1 + TILE_OVERLAP))), th = Math.min(H, Math.ceil((H / 2) * (1 + TILE_OVERLAP)));
    const spots = [[0, 0], [W - tw, 0], [0, H - th], [W - tw, H - th]];
    const out: Tile[] = [];
    for (let i = 0; i < 4; i++) {
      const buf = await sharp(buffer, { failOn: "none" })
        .rotate()
        .extract({ left: spots[i][0], top: spots[i][1], width: tw, height: th })
        .resize({ width: TILE_MAX_SIDE, height: TILE_MAX_SIDE, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      out.push({ label: NAMES[i], base64: buf.toString("base64"), mediaType: "image/jpeg" });
    }
    return out;
  } catch {
    return [];
  }
}
