// The saved snapshot of one floor's drawing: enough to rebuild its plan sheet later, on the server, without the editor
// (for the floor plan page inside a report and for the public share link).
//
// It is written by the browser at save time, so it is UNTRUSTED. cleanSheetData() rebuilds it from scratch: the drawing
// goes through the strict SVG whitelist (lib/svgSanitize.ts) and every number and name is checked and capped, so what
// is stored - and later drawn into a PDF or shown on a public page - can never carry script, links or anything odd.

import { sanitizeSvgInner } from "./svgSanitize";
import { cleanLabelText } from "./floorPlanObjects";
import type { SheetRoom } from "./floorPlanSheet";

export type SheetData = {
  innerSvg: string;
  pxPerMetre: number;
  originPx: number;
  footprint: { minX: number; minY: number; maxX: number; maxY: number };
  rooms: SheetRoom[];
};

export const MAX_SHEET_DATA_BYTES = 1_500_000;
const MAX_ROOMS = 200;
const MAX_COORD = 400;

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const within = (v: unknown, lo: number, hi: number): v is number => finite(v) && v >= lo && v <= hi;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function cleanSheetData(raw: unknown): SheetData | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.innerSvg !== "string") return null;
  const innerSvg = sanitizeSvgInner(o.innerSvg);
  if (!innerSvg) return null; // nothing drawn (or unusable): there is no sheet to make

  const pxPerMetre = within(o.pxPerMetre, 10, 200) ? o.pxPerMetre : 40;
  const originPx = within(o.originPx, 0, 100) ? o.originPx : 10;
  const f = o.footprint as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  if (!(within(f.minX, -MAX_COORD, MAX_COORD) && within(f.minY, -MAX_COORD, MAX_COORD) && within(f.maxX, -MAX_COORD, MAX_COORD) && within(f.maxY, -MAX_COORD, MAX_COORD))) return null;
  if (f.maxX < f.minX || f.maxY < f.minY) return null;

  const rooms: SheetRoom[] = [];
  if (Array.isArray(o.rooms)) {
    for (const item of o.rooms) {
      if (rooms.length >= MAX_ROOMS) break;
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const name = cleanLabelText(r.name);
      if (!name || !within(r.widthM, 0, 100) || !within(r.lengthM, 0, 100) || !within(r.areaM2, 0, 10000)) continue;
      rooms.push({ name, widthM: r3(r.widthM), lengthM: r3(r.lengthM), areaM2: r3(r.areaM2), ...(r.external === true ? { external: true } : {}) });
    }
  }

  const clean: SheetData = { innerSvg, pxPerMetre, originPx, footprint: { minX: r3(f.minX), minY: r3(f.minY), maxX: r3(f.maxX), maxY: r3(f.maxY) }, rooms };
  return JSON.stringify(clean).length <= MAX_SHEET_DATA_BYTES ? clean : null;
}

// Reads what was stored, defensively: it may be missing, or (if the database was ever edited by hand) malformed.
export function parseStoredSheetData(json: string | null | undefined): SheetData | null {
  if (!json || typeof json !== "string") return null;
  try {
    return cleanSheetData(JSON.parse(json));
  } catch {
    return null;
  }
}
