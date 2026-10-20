// The one strict SVG whitelist, shared by everything that handles a plan drawing from outside the editor:
//   - the PDF converter (lib/pdf/SheetPdf.tsx) draws only what passes it;
//   - the save action stores only what passes it (sanitizeSvgInner), so a stored drawing can never hold script,
//     links, images or styles, whatever was sent;
//   - the public share page shows only what passes it.
//
// It is not a general SVG engine. It understands exactly the shapes a plan is made of, checks every value it keeps,
// and DROPS everything else - scripts, links, images, styles, unknown tags and attributes - instead of trying to
// interpret them.

export const MAX_SVG_BYTES = 3_000_000;
const MAX_NODES = 60_000;
const MAX_DEPTH = 48;
const MAX_ABS = 1_000_000; // no coordinate in a real plan comes anywhere near this

export type XNode = { tag: string; attrs: Record<string, string>; children: XNode[]; text: string };

const KEEP_TAGS = new Set(["svg", "g", "line", "rect", "circle", "ellipse", "polygon", "polyline", "path", "text", "tspan"]);
// Their whole subtree is dropped: definitions (patterns, markers, clip paths), anything that can pull in outside
// content or run code, and anything else this does not draw.
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e] ?? "";
  });
}

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/[a-zA-Z][\w:.-]*\s*>|<[a-zA-Z][\w:.-]*(?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*\s*\/?>|[^<]+|</g;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

// A small purpose-built parser, not a general XML parser. Returns null when the input is not usable.
export function parseSvg(xml: string): XNode | null {
  if (typeof xml !== "string" || xml.length === 0 || xml.length > MAX_SVG_BYTES) return null;
  const root: XNode = { tag: "#root", attrs: {}, children: [], text: "" };
  const stack: XNode[] = [root];
  let skipDepth = 0; // > 0 while inside a subtree being thrown away
  let nodes = 0;
  for (const m of xml.matchAll(TOKEN)) {
    const tok = m[0];
    if (tok.startsWith("<!--") || tok.startsWith("<?") || tok.startsWith("<!") ) continue;
    if (tok.startsWith("</")) {
      const name = tok.slice(2, -1).trim().toLowerCase().replace(/^.*:/, "");
      if (skipDepth > 0) {
        skipDepth--;
        continue;
      }
      if (stack.length > 1 && stack[stack.length - 1].tag === name) stack.pop();
      continue;
    }
    if (tok.startsWith("<") && tok.length > 1) {
      const selfClose = tok.endsWith("/>");
      const name = (/^<([a-zA-Z][\w:.-]*)/.exec(tok)?.[1] ?? "").toLowerCase().replace(/^.*:/, "");
      if (skipDepth > 0) {
        if (!selfClose) skipDepth++;
        continue;
      }
      if (!KEEP_TAGS.has(name)) {
        if (!selfClose) skipDepth = 1;
        continue;
      }
      if (++nodes > MAX_NODES || stack.length > MAX_DEPTH) return null;
      const attrs: Record<string, string> = {};
      for (const a of tok.matchAll(ATTR)) {
        const key = a[1].toLowerCase().replace(/^.*:/, "");
        attrs[key] = decode(a[2] ?? a[3] ?? "");
      }
      const node: XNode = { tag: name, attrs, children: [], text: "" };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
      continue;
    }
    if (skipDepth === 0 && stack.length > 1) stack[stack.length - 1].text += decode(tok);
  }
  return root.children.find((c) => c.tag === "svg") ?? null;
}

// ---- value checks: anything that is not exactly what the sheet produces is dropped ----
export const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number(v.trim());
  return Number.isFinite(n) && Math.abs(n) <= MAX_ABS ? n : undefined;
};
export const COLOUR = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|none|transparent)$/;
export const TRANSFORM = /^(\s*(translate|rotate|scale|matrix)\(\s*[-+\d.eE,\s]+\)\s*)+$/;
export const PATHDATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/;
export const POINTS = /^[0-9eE+\-.,\s]+$/;

export function colour(v: string | undefined): string | undefined {
  if (v === undefined) return undefined;
  const c = v.trim();
  if (!COLOUR.test(c)) return "none";
  return c.toLowerCase() === "transparent" ? "none" : c;
}


// ---- storing: rebuild markup from the whitelist only ------------------------------------------------------------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const numStr = (n: number) => String(Math.round(n * 10000) / 10000);

// Every attribute that survives, validated, as plain strings. Anything not listed is gone.
export function cleanAttrs(node: XNode): Record<string, string> {
  const a = node.attrs;
  const out: Record<string, string> = {};
  const n = (k: string, as = k, min?: number) => {
    const v = num(a[k]);
    if (v !== undefined && (min === undefined || v >= min)) out[as] = numStr(v);
  };
  for (const k of ["x", "y", "x1", "y1", "x2", "y2", "cx", "cy"]) n(k);
  for (const k of ["width", "height", "r", "rx", "ry"]) n(k, k, 0);
  const fill = colour(a.fill);
  if (fill !== undefined) out.fill = fill;
  const stroke = colour(a.stroke);
  if (stroke !== undefined) out.stroke = stroke;
  n("stroke-width", "stroke-width", 0);
  if (a["stroke-dasharray"] && /^[\d.,\s]+$/.test(a["stroke-dasharray"])) out["stroke-dasharray"] = a["stroke-dasharray"].trim();
  if (a["stroke-linecap"] && /^(butt|round|square)$/.test(a["stroke-linecap"])) out["stroke-linecap"] = a["stroke-linecap"];
  if (a["stroke-linejoin"] && /^(miter|round|bevel)$/.test(a["stroke-linejoin"])) out["stroke-linejoin"] = a["stroke-linejoin"];
  for (const k of ["opacity", "fill-opacity", "stroke-opacity"]) {
    const v = num(a[k]);
    if (v !== undefined && v >= 0 && v <= 1) out[k] = numStr(v);
  }
  if (a.transform && TRANSFORM.test(a.transform)) out.transform = a.transform.trim();
  if (node.tag === "polygon" || node.tag === "polyline") if (a.points && POINTS.test(a.points)) out.points = a.points.trim();
  if (node.tag === "path" && a.d && PATHDATA.test(a.d) && a.d.length <= 20000) out.d = a.d.trim();
  if (node.tag === "text" || node.tag === "tspan") {
    const size = num(a["font-size"]);
    if (size !== undefined && size > 0 && size <= 1000) out["font-size"] = numStr(size);
    if (a["font-weight"] === "bold" || (num(a["font-weight"]) ?? 0) > 0) out["font-weight"] = a["font-weight"] === "bold" ? "bold" : numStr(num(a["font-weight"])!);
    if (/^(start|middle|end)$/.test(a["text-anchor"] ?? "")) out["text-anchor"] = a["text-anchor"];
  }
  return out;
}

const needs = (node: XNode): boolean => {
  const a = cleanAttrs(node);
  switch (node.tag) {
    case "rect": return !!a.width && !!a.height && Number(a.width) > 0 && Number(a.height) > 0;
    case "circle": return !!a.r && Number(a.r) > 0;
    case "ellipse": return !!a.rx && !!a.ry && Number(a.rx) > 0 && Number(a.ry) > 0;
    case "polygon":
    case "polyline": return !!a.points;
    case "path": return !!a.d;
    default: return true;
  }
};

export function serializeNode(node: XNode): string {
  if (!needs(node)) return "";
  const a = cleanAttrs(node);
  const attrs = Object.entries(a).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
  if (node.tag === "text") {
    const content = [node.text, ...node.children.filter((c) => c.tag === "tspan").map((c) => c.text)].join("").replace(/\s+/g, " ").trim();
    return content ? `<text${attrs}>${esc(content)}</text>` : "";
  }
  if (node.tag === "g") return `<g${attrs}>${node.children.map(serializeNode).join("")}</g>`;
  if (node.tag === "tspan" || node.tag === "svg") return "";
  return `<${node.tag}${attrs}/>`;
}

export const MAX_INNER_BYTES = 1_200_000;

// The children of an <svg>, as safe markup: only whitelisted tags and validated attributes, rebuilt from scratch.
// Returns null when the input is unusable (too large, nested too deep, or too many shapes).
export function sanitizeSvgInner(inner: string): string | null {
  if (typeof inner !== "string" || inner.length > MAX_INNER_BYTES) return null;
  const root = parseSvg(`<svg>${inner}</svg>`);
  if (!root) return null;
  const out = root.children.map(serializeNode).join("");
  return out.length <= MAX_INNER_BYTES ? out : null;
}
