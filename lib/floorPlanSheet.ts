import { readLogo } from "./logoImage";
// The professional "plan sheet": what a client is actually handed. The editor's drawing is placed, at a proper
// architectural scale (1:50, 1:100 ...), on an A4 or A3 page with a title block, overall dimensions OUTSIDE the
// building, a scale bar, a north arrow, a room schedule with the gross internal area, and the disclaimer.
//
// Everything here is plain arithmetic and string-building - no browser, no React - so it can be tested to the
// millimetre, and the very same SVG feeds every format: the PDF (vector), the print-quality PNG and the SVG file.
// All coordinates are in MILLIMETRES on the page.

export type Paper = "A4" | "A3";
export type Orientation = "portrait" | "landscape";
export type SheetStyle = "colour" | "bw";

export const PAPERS: Record<Paper, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A3: { w: 297, h: 420 } };

// Standard architectural scales, largest drawing first. 1:50 is as big as a small flat should ever be drawn.
export const SCALES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500];
// Beyond 1:150 the plan's own labels (drawn for screen) get too small to read comfortably on paper.
export const MAX_LEGIBLE_SCALE = 150;

export const MARGIN = 12;
const HEADER_H = 22;
const DIM_LEFT = 12; // room outside the building, left and top, for the overall dimension lines
const DIM_RIGHT = 4;
const STRIP_H = 14; // under the drawing: the scale bar and the north arrow
const GAP = 6;
const ROW_H = 4.4;

export type SheetRoom = { name: string; widthM: number; lengthM: number; areaM2: number; external?: boolean };

export type SheetInput = {
  // The editor's drawing, children only (no <svg> wrapper), in the editor's own pixel units.
  innerSvg: string;
  pxPerMetre: number;
  // Where plan metre (0, 0) sits inside the drawing, in its pixels (the editor leaves a margin).
  originPx: number;
  // The building's outline on the plan, in metres.
  footprint: { minX: number; minY: number; maxX: number; maxY: number };
  rooms: SheetRoom[];
  title: { address: string; floorName: string; company: string; website?: string; date: Date; logo?: { dataUri: string } };
  style?: SheetStyle;
  paper?: Paper | "auto";
  orientation?: Orientation | "auto";
  // "mm" gives the SVG a real-world size (opens at true size in design software); "px" sets width/height for
  // rasterising at a print resolution - 300 dpi makes A4 the standard 2480 x 3508 pixels.
  size?: { unit: "mm" } | { unit: "px"; dpi: number };
};

export type SheetResult = {
  svg: string;
  // Where the company logo was drawn on the page, in mm - the PDF draws it as a real image at this spot. Absent when
  // there is no (valid) logo.
  logo?: { x: number; y: number; w: number; h: number };
  paper: Paper;
  orientation: Orientation;
  widthMm: number;
  heightMm: number;
  scale: number; // the denominator: 100 means 1:100
  fits: boolean; // false only if even the smallest scale on the biggest paper could not hold the plan
  legible: boolean; // false when the scale is so small the plan's own text is hard to read
  totalInternalM2: number;
  totalExternalM2: number;
  // Where things landed on the page, in mm - for checking the layout, not for drawing.
  layout: { planBox: { x: number; y: number; w: number; h: number }; headerBottom: number; stripTop: number; scheduleTop: number; scheduleBottom: number; mmPerM: number; step: number; segMm: number; columns: number };
};

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const M2_TO_SQFT = 10.7639;
export const formatM2 = (m2: number) => `${m2.toFixed(1)}`;
export const formatSqFt = (m2: number) => `${Math.round(m2 * M2_TO_SQFT)}`;

function formatDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Helvetica's average character is a little over half its font size wide. Using 0.55 keeps wrapped lines safely
// inside their box (a line that is a touch too short is invisible; one that overflows is not).
const AVG_CHAR = 0.55;
export function wrapText(text: string, maxWidthMm: number, fontSizeMm: number): string[] {
  const maxChars = Math.max(8, Math.floor(maxWidthMm / (fontSizeMm * AVG_CHAR)));
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const test = line ? `${line} ${word}` : word;
    if (test.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = test;
  }
  if (line) lines.push(line);
  return lines;
}

export const DISCLAIMER =
  "This plan is for illustrative purposes only. Measurements of doors, windows, rooms and any other items are approximate - no responsibility is taken for any error, omission, or misstatement.";

// ---- colour handling ----
const FILL_TO_WHITE = ["#E7ECF0", "#E7F0EC", "#F0E7EC", "#FBF0E7", "#FFEDD5", "#FBF8F4"];
const BW_MAP: Record<string, string> = { "#25344A": "#000000", "#8B7355": "#444444", "#5B8AA6": "#000000", "#8FAE8B": "#666666", "#6B6A63": "#333333", "#E9E3D9": "#BBBBBB", "#D3CABB": "#999999" };

// On the white page the editor's warm off-white (used for door gaps) becomes plain white; in black-and-white the
// pastel room tints go too, and the navy/brown/blue linework becomes black and grey.
export function recolour(innerSvg: string, style: SheetStyle): string {
  return innerSvg.replace(/(fill|stroke)="(#[0-9A-Fa-f]{6})"/g, (m, attr: string, hex: string) => {
    const h = hex.toUpperCase();
    if (attr === "fill" && (style === "bw" ? FILL_TO_WHITE.includes(h) : h === "#FBF8F4")) return `${attr}="#FFFFFF"`;
    if (style === "bw" && BW_MAP[h]) return `${attr}="${BW_MAP[h]}"`;
    return m;
  });
}

type Candidate = { paper: Paper; orientation: Orientation; scale: number; fits: boolean };

function areaFor(paper: Paper, orientation: Orientation, scheduleH: number) {
  const { w, h } = PAPERS[paper];
  const W = orientation === "portrait" ? w : h;
  const H = orientation === "portrait" ? h : w;
  const areaX = MARGIN;
  const areaY = MARGIN + HEADER_H + GAP;
  const areaW = W - 2 * MARGIN;
  const areaH = H - MARGIN - scheduleH - GAP - areaY - 14; // 14 = disclaimer + footer lines at the very bottom
  return { W, H, areaX, areaY, areaW, areaH };
}

// The schedule is one column of rows, or two side by side when there are many rooms.
function scheduleLayout(roomCount: number, hasExternal: boolean, widthMm: number) {
  const columns = roomCount > 10 && widthMm > 150 ? 2 : 1;
  const rowsPerColumn = Math.ceil(Math.max(roomCount, 1) / columns);
  const height = 6 + (rowsPerColumn + 1) * ROW_H + (hasExternal ? 2 : 1) * ROW_H + 2;
  return { columns, rowsPerColumn, height };
}

export function chooseLayout(input: Pick<SheetInput, "footprint" | "rooms" | "paper" | "orientation">): Candidate & { scheduleH: number } {
  const fw = Math.max(0.1, input.footprint.maxX - input.footprint.minX);
  const fh = Math.max(0.1, input.footprint.maxY - input.footprint.minY);
  const hasExternal = input.rooms.some((r) => r.external);
  const papers: Paper[] = input.paper && input.paper !== "auto" ? [input.paper] : ["A4", "A3"];
  const orientations: Orientation[] = input.orientation && input.orientation !== "auto" ? [input.orientation] : ["portrait", "landscape"];
  let best: (Candidate & { scheduleH: number }) | null = null;
  for (const paper of papers) {
    let paperBest: (Candidate & { scheduleH: number }) | null = null;
    for (const orientation of orientations) {
      const W = orientation === "portrait" ? PAPERS[paper].w : PAPERS[paper].h;
      const sch = scheduleLayout(input.rooms.length, hasExternal, W - 2 * MARGIN);
      const a = areaFor(paper, orientation, sch.height);
      for (const scale of SCALES) {
        const mmPerM = 1000 / scale;
        if (fw * mmPerM + DIM_LEFT + DIM_RIGHT <= a.areaW && fh * mmPerM + DIM_LEFT + DIM_RIGHT <= a.areaH - STRIP_H) {
          if (!paperBest || scale < paperBest.scale) paperBest = { paper, orientation, scale, fits: true, scheduleH: sch.height };
          break; // smaller denominators were tried first - the first that fits is the best for this orientation
        }
      }
    }
    // Prefer the smaller paper whenever the plan fits it at a legible scale; only step up to A3 when it doesn't.
    if (paperBest && paperBest.scale <= MAX_LEGIBLE_SCALE) return paperBest;
    if (paperBest && (!best || paperBest.scale < best.scale)) best = paperBest;
  }
  if (best) return best;
  // Nothing fits even at 1:500 - use the biggest paper at the smallest scale and say so.
  const paper = papers[papers.length - 1];
  const orientation: Orientation = fw >= fh ? "landscape" : "portrait";
  const W = orientation === "portrait" ? PAPERS[paper].w : PAPERS[paper].h;
  return { paper, orientation, scale: SCALES[SCALES.length - 1], fits: false, scheduleH: scheduleLayout(input.rooms.length, hasExternal, W - 2 * MARGIN).height };
}

const INK = "#25344A";
const GREY = "#6B6A63";

const t = (x: number, y: number, text: string, size: number, opts: { anchor?: "start" | "middle" | "end"; bold?: boolean; fill?: string; rotate?: number } = {}) =>
  `<text x="${r(x)}" y="${r(y)}" font-size="${size}" fill="${opts.fill ?? INK}"${opts.bold ? ' font-weight="700"' : ""} text-anchor="${opts.anchor ?? "start"}"${opts.rotate !== undefined ? ` transform="rotate(${opts.rotate}, ${r(x)}, ${r(y)})"` : ""}>${escapeXml(text)}</text>`;
const ln = (x1: number, y1: number, x2: number, y2: number, w = 0.25, stroke = INK) => `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${stroke}" stroke-width="${w}"/>`;
function r(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function buildSheet(input: SheetInput): SheetResult {
  const style: SheetStyle = input.style ?? "colour";
  const layout = chooseLayout(input);
  const { paper, orientation, scale } = layout;
  const a = areaFor(paper, orientation, layout.scheduleH);
  const { W, H } = a;
  const mmPerM = 1000 / scale;
  const fw = Math.max(0.1, input.footprint.maxX - input.footprint.minX);
  const fh = Math.max(0.1, input.footprint.maxY - input.footprint.minY);
  const fwMm = fw * mmPerM;
  const fhMm = fh * mmPerM;

  // ---- where the building sits: the plan plus its dimension margin, centred in the drawing area ----
  const blockW = DIM_LEFT + fwMm + DIM_RIGHT;
  const blockH = DIM_LEFT + fhMm + DIM_RIGHT;
  const drawH = a.areaH - STRIP_H;
  const startX = a.areaX + Math.max(0, (a.areaW - blockW) / 2);
  const startY = a.areaY + Math.max(0, (drawH - blockH) / 2);
  const X0 = startX + DIM_LEFT; // the building's top-left, on the page
  const Y0 = startY + DIM_LEFT;
  const k = mmPerM / input.pxPerMetre; // page millimetres per drawing pixel
  const tx = X0 - k * (input.originPx + input.footprint.minX * input.pxPerMetre);
  const ty = Y0 - k * (input.originPx + input.footprint.minY * input.pxPerMetre);

  const parts: string[] = [];
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>`);

  // ---- title block ----
  const company = input.title.company.trim() || "ProptMate";
  parts.push(t(MARGIN, MARGIN + 5.5, company, 5.2, { bold: true }));
  // The company logo sits top-right. It is checked again here (it is only ever embedded if it is a genuine, small PNG or
  // JPEG), and kept inside a box of 36 x 12 mm so it can never crowd the title block.
  const logo = input.title.logo ? readLogo(input.title.logo.dataUri) : null;
  let logoBox: { x: number; y: number; w: number; h: number } | undefined;
  if (logo) {
    const h = Math.min(12, 36 / logo.aspect);
    const w = h * logo.aspect;
    logoBox = { x: Math.round((W - MARGIN - w) * 100) / 100, y: MARGIN + 0.5, w: Math.round(w * 100) / 100, h: Math.round(h * 100) / 100 };
    parts.push(`<image x="${logoBox.x}" y="${logoBox.y}" width="${logoBox.w}" height="${logoBox.h}" href="${logo.dataUri}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  // "FLOOR PLAN" normally sits top-right; with a logo there it moves to the bottom-right of the title block.
  parts.push(logoBox ? t(W - MARGIN, MARGIN + 17.8, "FLOOR PLAN", 3.4, { anchor: "end", bold: true, fill: GREY }) : t(W - MARGIN, MARGIN + 5, "FLOOR PLAN", 3.4, { anchor: "end", bold: true, fill: GREY }));
  const addressLines = wrapText(input.title.address || "Property address", W - 2 * MARGIN - 4 - (logoBox ? logoBox.w + 4 : 0), 4.6).slice(0, 2);
  parts.push(t(MARGIN, MARGIN + 12.5, addressLines[0], 4.6, { bold: true }));
  if (addressLines[1]) parts.push(t(MARGIN, MARGIN + 17.2, addressLines[1], 4.6, { bold: true }));
  const internal = input.rooms.filter((x) => !x.external);
  const external = input.rooms.filter((x) => x.external);
  const totalInternalM2 = internal.reduce((s, x) => s + x.areaM2, 0);
  const totalExternalM2 = external.reduce((s, x) => s + x.areaM2, 0);
  const floorLine = `${input.title.floorName || "Floor"}  ·  Approx. gross internal area ${formatM2(totalInternalM2)} sq m (${formatSqFt(totalInternalM2)} sq ft)`;
  parts.push(t(MARGIN, MARGIN + (addressLines[1] ? 21.4 : 17.8), floorLine, 3.2, { fill: GREY }));
  parts.push(ln(MARGIN, MARGIN + HEADER_H, W - MARGIN, MARGIN + HEADER_H, 0.35));

  // ---- the drawing, at scale ----
  const inner = recolour(input.innerSvg, style);
  parts.push(`<g transform="translate(${r(tx)}, ${r(ty)}) scale(${r(k * 1e6) / 1e6})">${inner}</g>`);

  // ---- overall dimensions, OUTSIDE the building (top and left) ----
  const dTop = Y0 - 6;
  parts.push(ln(X0, dTop, X0 + fwMm, dTop, 0.25), ln(X0, dTop - 1.6, X0, dTop + 1.6, 0.25), ln(X0 + fwMm, dTop - 1.6, X0 + fwMm, dTop + 1.6, 0.25));
  parts.push(t(X0 + fwMm / 2, dTop - 1.8, `${fw.toFixed(2)}m`, 3, { anchor: "middle" }));
  const dLeft = X0 - 6;
  parts.push(ln(dLeft, Y0, dLeft, Y0 + fhMm, 0.25), ln(dLeft - 1.6, Y0, dLeft + 1.6, Y0, 0.25), ln(dLeft - 1.6, Y0 + fhMm, dLeft + 1.6, Y0 + fhMm, 0.25));
  parts.push(t(dLeft - 1.8, Y0 + fhMm / 2, `${fh.toFixed(2)}m`, 3, { anchor: "middle", rotate: -90 }));

  // ---- scale bar and north arrow, in the strip under the drawing ----
  const stripY = a.areaY + drawH + 4;
  let step = 1;
  for (const s of [10, 5, 2, 1, 0.5]) {
    if (s * 4 * mmPerM <= 50 && s * mmPerM >= 6) {
      step = s;
      break;
    }
  }
  const segMm = step * mmPerM;
  parts.push(t(a.areaX, stripY, `Scale 1:${scale} at ${paper}`, 2.6, { fill: GREY, bold: true }));
  for (let i = 0; i < 4; i++) {
    const x = a.areaX + i * segMm;
    parts.push(`<rect x="${r(x)}" y="${r(stripY + 1.6)}" width="${r(segMm)}" height="1.8" fill="${i % 2 === 0 ? INK : "#FFFFFF"}" stroke="${INK}" stroke-width="0.2"/>`);
  }
  for (let i = 0; i <= 4; i++) {
    const label = `${+(step * i).toFixed(1)}${i === 4 ? " m" : ""}`;
    parts.push(t(a.areaX + i * segMm, stripY + 7.4, label, 2.4, { anchor: "middle" }));
  }
  const nx = W - MARGIN - 6;
  parts.push(ln(nx, stripY + 8, nx, stripY + 1.5, 0.5), `<path d="M ${r(nx - 1.8)},${r(stripY + 4.2)} L ${r(nx)},${r(stripY - 0.2)} L ${r(nx + 1.8)},${r(stripY + 4.2)} Z" fill="${INK}"/>`, t(nx, stripY + 11, "N", 2.8, { anchor: "middle", bold: true }));

  // ---- room schedule ----
  const sch = scheduleLayout(input.rooms.length, external.length > 0, W - 2 * MARGIN);
  const schTop = H - MARGIN - 14 - sch.height;
  parts.push(t(MARGIN, schTop + 3.2, "Room schedule", 3.2, { bold: true }));
  const tableW = W - 2 * MARGIN;
  const colW = sch.columns === 2 ? (tableW - 8) / 2 : tableW;
  const ordered = [...internal, ...external];
  for (let c = 0; c < sch.columns; c++) {
    const x0 = MARGIN + c * (colW + 8);
    const y0 = schTop + 6;
    const cols = { name: x0 + 1, size: x0 + colW * 0.52, sqm: x0 + colW * 0.78, sqft: x0 + colW - 1 };
    parts.push(`<rect x="${r(x0)}" y="${r(y0)}" width="${r(colW)}" height="${ROW_H}" fill="${style === "bw" ? "#EEEEEE" : "#E7ECF0"}"/>`);
    parts.push(t(cols.name, y0 + 3.1, "Room", 2.6, { bold: true }), t(cols.size, y0 + 3.1, "Size (m)", 2.6, { bold: true, anchor: "middle" }), t(cols.sqm, y0 + 3.1, "Area (sq m)", 2.6, { bold: true, anchor: "end" }), t(cols.sqft, y0 + 3.1, "sq ft", 2.6, { bold: true, anchor: "end" }));
    const slice = ordered.slice(c * sch.rowsPerColumn, (c + 1) * sch.rowsPerColumn);
    slice.forEach((room, i) => {
      const y = y0 + ROW_H * (i + 1);
      const nm = room.name.length > 30 ? `${room.name.slice(0, 29)}…` : room.name;
      parts.push(ln(x0, y + ROW_H, x0 + colW, y + ROW_H, 0.12, "#BBBBBB"));
      parts.push(t(cols.name, y + 3.1, room.external ? `${nm} (external)` : nm, 2.6), t(cols.size, y + 3.1, `${room.widthM.toFixed(2)} × ${room.lengthM.toFixed(2)}`, 2.6, { anchor: "middle" }), t(cols.sqm, y + 3.1, formatM2(room.areaM2), 2.6, { anchor: "end" }), t(cols.sqft, y + 3.1, formatSqFt(room.areaM2), 2.6, { anchor: "end" }));
    });
  }
  const totY = schTop + 6 + ROW_H * (sch.rowsPerColumn + 1) + 1;
  parts.push(ln(MARGIN, totY, W - MARGIN, totY, 0.35));
  parts.push(t(MARGIN + 1, totY + 3.4, "Total approx. gross internal area", 2.8, { bold: true }), t(W - MARGIN - 1, totY + 3.4, `${formatM2(totalInternalM2)} sq m  (${formatSqFt(totalInternalM2)} sq ft)`, 2.8, { bold: true, anchor: "end" }));
  if (external.length) parts.push(t(MARGIN + 1, totY + 3.4 + ROW_H, "External areas (not included above)", 2.6, { fill: GREY }), t(W - MARGIN - 1, totY + 3.4 + ROW_H, `${formatM2(totalExternalM2)} sq m  (${formatSqFt(totalExternalM2)} sq ft)`, 2.6, { fill: GREY, anchor: "end" }));

  // ---- disclaimer and footer ----
  const disc = wrapText(DISCLAIMER, W - 2 * MARGIN, 2.2);
  disc.forEach((line, i) => parts.push(t(MARGIN, H - MARGIN - 8 + i * 3.1, line, 2.2, { fill: GREY })));
  const prepared = `Prepared by ${company}${input.title.website ? `  ·  ${input.title.website}` : ""}  ·  ${formatDate(input.title.date)}`;
  parts.push(t(MARGIN, H - MARGIN + 1, prepared, 2.4, { fill: GREY }), t(W - MARGIN, H - MARGIN + 1, "Created with ProptMate", 2.4, { fill: GREY, anchor: "end" }));

  const size = input.size ?? { unit: "mm" };
  const sizeAttrs = size.unit === "mm" ? `width="${W}mm" height="${H}mm"` : `width="${Math.round((W / 25.4) * size.dpi)}" height="${Math.round((H / 25.4) * size.dpi)}"`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ${sizeAttrs} font-family="Helvetica, Arial, sans-serif">${parts.join("")}</svg>`;
  const scheduleBottom = totY + ROW_H * (external.length ? 2 : 1) + 1;
  return {
    svg,
    paper,
    logo: logoBox,
    orientation,
    widthMm: W,
    heightMm: H,
    scale,
    fits: layout.fits,
    legible: scale <= MAX_LEGIBLE_SCALE,
    totalInternalM2,
    totalExternalM2,
    layout: { planBox: { x: X0, y: Y0, w: fwMm, h: fhMm }, headerBottom: MARGIN + HEADER_H, stripTop: stripY - 3, scheduleTop: schTop, scheduleBottom, mmPerM, step, segMm, columns: sch.columns },
  };
}
