import React from "react";
import { Document, Page, Svg, G, Line, Rect, Circle, Ellipse, Polygon, Polyline, Path, Text, Image } from "@react-pdf/renderer";
import { readLogo } from "../logoImage";
import { parseSvg, MAX_SVG_BYTES, num, colour, TRANSFORM, PATHDATA, POINTS, type XNode } from "../svgSanitize";

export { parseSvg, MAX_SVG_BYTES };

// Turns the plan sheet (lib/floorPlanSheet.ts) into a real VECTOR PDF page: every wall, door arc and letter stays
// sharp at any zoom and prints cleanly. Nothing is rasterised.
//
// The SVG arrives from the browser, so it is treated as untrusted. This is not a general SVG engine: it understands
// exactly the shapes the sheet is made of, checks every value it keeps, and drops everything else - scripts, links,
// images, styles, unknown tags and attributes - rather than trying to interpret them.

function common(a: Record<string, string>): Record<string, any> {
  const p: Record<string, any> = {};
  const fill = colour(a.fill);
  if (fill !== undefined) p.fill = fill;
  const stroke = colour(a.stroke);
  if (stroke !== undefined) p.stroke = stroke;
  const sw = num(a["stroke-width"]);
  if (sw !== undefined && sw >= 0) p.strokeWidth = sw;
  if (a["stroke-dasharray"] && /^[\d.,\s]+$/.test(a["stroke-dasharray"])) p.strokeDasharray = a["stroke-dasharray"].trim();
  if (a["stroke-linecap"] && /^(butt|round|square)$/.test(a["stroke-linecap"])) p.strokeLinecap = a["stroke-linecap"];
  if (a["stroke-linejoin"] && /^(miter|round|bevel)$/.test(a["stroke-linejoin"])) p.strokeLinejoin = a["stroke-linejoin"];
  for (const [k, prop] of [["opacity", "opacity"], ["fill-opacity", "fillOpacity"], ["stroke-opacity", "strokeOpacity"]] as const) {
    const n = num(a[k]);
    if (n !== undefined && n >= 0 && n <= 1) p[prop] = n;
  }
  if (a.transform && TRANSFORM.test(a.transform)) p.transform = a.transform.trim();
  return p;
}

let keyCounter = 0;
export function toElement(node: XNode, inheritedFont?: { size?: number }): React.ReactElement | null {
  const a = node.attrs;
  const key = `n${keyCounter++}`;
  const kids = () => node.children.map((c) => toElement(c)).filter(Boolean) as React.ReactElement[];
  switch (node.tag) {
    case "g":
      return <G key={key} {...common(a)}>{kids()}</G>;
    case "line": {
      const [x1, y1, x2, y2] = [num(a.x1) ?? 0, num(a.y1) ?? 0, num(a.x2) ?? 0, num(a.y2) ?? 0];
      return <Line key={key} x1={x1} y1={y1} x2={x2} y2={y2} {...common(a)} />;
    }
    case "rect": {
      const w = num(a.width), h = num(a.height);
      if (!w || !h || w < 0 || h < 0) return null;
      return <Rect key={key} x={num(a.x) ?? 0} y={num(a.y) ?? 0} width={w} height={h} {...(num(a.rx) !== undefined ? { rx: num(a.rx) } : {})} {...common(a)} />;
    }
    case "circle": {
      const r = num(a.r);
      if (!r || r < 0) return null;
      return <Circle key={key} cx={num(a.cx) ?? 0} cy={num(a.cy) ?? 0} r={r} {...common(a)} />;
    }
    case "ellipse": {
      const rx = num(a.rx), ry = num(a.ry);
      if (!rx || !ry || rx < 0 || ry < 0) return null;
      return <Ellipse key={key} cx={num(a.cx) ?? 0} cy={num(a.cy) ?? 0} rx={rx} ry={ry} {...common(a)} />;
    }
    case "polygon":
    case "polyline": {
      if (!a.points || !POINTS.test(a.points)) return null;
      return node.tag === "polygon" ? <Polygon key={key} points={a.points.trim()} {...common(a)} /> : <Polyline key={key} points={a.points.trim()} {...common(a)} />;
    }
    case "path": {
      if (!a.d || !PATHDATA.test(a.d) || a.d.length > 20000) return null;
      return <Path key={key} d={a.d.trim()} {...common(a)} />;
    }
    case "text": {
      const content = [node.text, ...node.children.filter((c) => c.tag === "tspan").map((c) => c.text)].join("").replace(/\s+/g, " ").trim();
      if (!content) return null;
      const size = num(a["font-size"]) ?? inheritedFont?.size ?? 10;
      if (size <= 0 || size > 1000) return null;
      const bold = a["font-weight"] === "bold" || (num(a["font-weight"]) ?? 400) >= 600;
      const anchor = /^(start|middle|end)$/.test(a["text-anchor"] ?? "") ? a["text-anchor"] : "start";
      const p = common(a);
      if (p.fill === undefined) p.fill = "#000000";
      // The library's TypeScript types for SVG text omit the font properties, though it honours them (the PDF tests
      // check the result: real bold, the right size) - so they are passed as one loosely-typed bundle.
      const font: Record<string, any> = { fontSize: size, fontFamily: "Helvetica", fontWeight: bold ? 700 : 400, textAnchor: anchor };
      return (
        <Text key={key} x={num(a.x) ?? 0} y={num(a.y) ?? 0} {...font} {...p}>
          {pdfSafeText(content)}
        </Text>
      );
    }
    default:
      return null;
  }
}

// The standard PDF font cannot draw these four characters - they simply vanish. Anything that reaches here (a room
// called "Flat 2²", a unit typed by hand) is turned into the plain digit or letter instead of disappearing.
// (Real bold has to be asked for as a font WEIGHT, a number; naming "Helvetica-Bold" as the family is ignored.)
export function pdfSafeText(s: string): string {
  return s.replace(/²/g, "2").replace(/³/g, "3").replace(/¹/g, "1").replace(/µ/g, "u");
}

export type PdfLogo = { dataUri: string; x: number; y: number; w: number; h: number };

// The strict drawing filter above never draws images, so the company logo is added separately as a real image, at the
// spot the sheet reserved for it - and only after being checked again: a genuine small PNG or JPEG, inside the page.
export function checkedLogo(logo: unknown, widthMm: number, heightMm: number): PdfLogo | null {
  if (!logo || typeof logo !== "object") return null;
  const l = logo as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const x = num(l.x), y = num(l.y), w = num(l.w), h = num(l.h);
  if (!(x >= 0 && y >= 0 && w > 0 && h > 0 && w <= 80 && h <= 40 && x + w <= widthMm + 0.01 && y + h <= heightMm + 0.01)) return null;
  if (!readLogo(l.dataUri)) return null;
  return { dataUri: l.dataUri as string, x, y, w, h };
}

export function SheetPdf({ svg, widthMm, heightMm, title, logo }: { svg: string; widthMm: number; heightMm: number; title?: string; logo?: unknown }) {
  const safeLogo = checkedLogo(logo, widthMm, heightMm);
  const root = parseSvg(svg);
  const PT = 72 / 25.4; // the sheet is drawn in millimetres; a PDF page is in points
  const wPt = widthMm * PT;
  const hPt = heightMm * PT;
  const children = root ? (root.children.map((c) => toElement(c)).filter(Boolean) as React.ReactElement[]) : [];
  return (
    <Document title={title ?? "Floor plan"} creator="ProptMate" producer="ProptMate">
      {/* One sheet, one page: wrap={false} stops the library ever starting a second page, and the drawing is a hair
          smaller than the page so rounding can never make it "taller than the page" (which it warns about, and which
          is how a blank second page would start). */}
      <Page size={[wPt, hPt]} style={{ padding: 0 }} wrap={false}>
        <Svg viewBox={`0 0 ${widthMm} ${heightMm}`} width={wPt - 0.02} height={hPt - 0.02}>
          {children}
        </Svg>
        {safeLogo && <Image src={safeLogo.dataUri} style={{ position: "absolute", left: safeLogo.x * PT, top: safeLogo.y * PT, width: safeLogo.w * PT, height: safeLogo.h * PT }} />}
      </Page>
    </Document>
  );
}
