// Prepares the editor's live drawing for the plan sheet. The editor's SVG is built for EDITING: it carries handles,
// a grid, hit areas, per-room dimension lines that run along every room's own edges (and so straight through the
// neighbouring room's text), a label on every door, and a few effects - a hatch pattern, an arrowhead marker - that
// are references to definitions elsewhere in the file. None of that belongs on something handed to a client, and the
// PDF converter draws only plain shapes. Works on any DOM (browser, or jsdom in the tests).

const SVG_NS = "http://www.w3.org/2000/svg";

// Elements the editor marks as "not part of the finished plan".
// Plus anything that could pull in outside content or run code - the drawing never uses these, and a plan sheet
// that is emailed around should never be able to either.
const REMOVE = ["[data-editor-only]", "[data-dimension-lines]", "[data-door-label]", "[data-connection-line]", "[data-compass]", "defs", "script", "image", "foreignObject", "use", "style", "a", "iframe", "animate", "set"];
const STAIR_ARROW_LENGTH = 9; // the arrowhead, in the drawing's own pixels
const STAIR_ARROW_HALF_WIDTH = 3.6;
export const GARDEN_TINT = "#E3EDDF";
const OVERLAP_WARNING_TINT = "#FEE2E2";

export type WallWeight = "thin" | "standard" | "bold";
const WALL_WEIGHT_FACTOR: Record<WallWeight, number> = { thin: 0.7, standard: 1, bold: 2.2 };

// wallWeight scales the thickness of the room outlines (the walls) for the printed plan; 'standard' leaves them as drawn.
export function cleanDrawingForSheet(root: Element, opts: { wallWeight?: WallWeight } = {}): string {
  const clone = root.cloneNode(true) as Element;
  clone.querySelectorAll(REMOVE.join(",")).forEach((n) => n.remove());

  // Hit areas (invisible rectangles that make things easy to grab) have no place on a printed plan.
  clone.querySelectorAll('[fill="transparent"]').forEach((n) => n.remove());

  // A stair's arrow head is a marker defined once and referred to by name; draw it as a plain triangle instead.
  clone.querySelectorAll("line[marker-end]").forEach((line) => {
    const x1 = parseFloat(line.getAttribute("x1") || "0");
    const y1 = parseFloat(line.getAttribute("y1") || "0");
    const x2 = parseFloat(line.getAttribute("x2") || "0");
    const y2 = parseFloat(line.getAttribute("y2") || "0");
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len > 0.001 && [x1, y1, x2, y2].every(Number.isFinite)) {
      const dx = (x2 - x1) / len;
      const dy = (y2 - y1) / len;
      const bx = x2 - dx * STAIR_ARROW_LENGTH;
      const by = y2 - dy * STAIR_ARROW_LENGTH;
      const head = line.ownerDocument.createElementNS(SVG_NS, "polygon");
      head.setAttribute("points", `${x2},${y2} ${bx - dy * STAIR_ARROW_HALF_WIDTH},${by + dx * STAIR_ARROW_HALF_WIDTH} ${bx + dy * STAIR_ARROW_HALF_WIDTH},${by - dx * STAIR_ARROW_HALF_WIDTH}`);
      head.setAttribute("fill", line.getAttribute("stroke") || "#25344A");
      line.parentNode?.insertBefore(head, line.nextSibling);
    }
    line.removeAttribute("marker-end");
  });

  // A garden's hatch is a pattern reference; a soft green tint says the same thing. Any other reference to a
  // definition that no longer exists would draw nothing, so it becomes "no fill" explicitly.
  clone.querySelectorAll("[fill^='url(']").forEach((el) => el.setAttribute("fill", /gardenHatch/.test(el.getAttribute("fill") || "") ? GARDEN_TINT : "none"));

  // The red tint (and dashed outline) that warns the person editing that two rooms overlap is for them, not the client.
  clone.querySelectorAll(`[fill="${OVERLAP_WARNING_TINT}"]`).forEach((el) => {
    el.setAttribute("fill", "#FFFFFF");
    el.removeAttribute("stroke-dasharray");
  });

  // The PDF's standard font cannot draw a superscript two (or three, or one) - the character simply vanishes - so
  // an area reads "5.9 sq m", the way plans are usually labelled anyway.
  clone.querySelectorAll("text, tspan").forEach((el) => {
    if (el.children.length === 0 && el.textContent && /[²³¹]/.test(el.textContent)) {
      el.textContent = el.textContent.replace(/(\d)\s*m²/g, "$1 sq m").replace(/²/g, "2").replace(/³/g, "3").replace(/¹/g, "1");
    }
  });

  // Wall thickness: the room outlines are the plan's walls, so a plan can be printed with finer or heavier ones.
  const factor = WALL_WEIGHT_FACTOR[opts.wallWeight ?? "standard"] ?? 1;
  if (factor !== 1) {
    clone.querySelectorAll("polygon").forEach((poly) => {
      const width = parseFloat(poly.getAttribute("stroke-width") || "");
      if ((poly.getAttribute("stroke") || "").toLowerCase() === "#25344a" && Number.isFinite(width) && width >= 1) poly.setAttribute("stroke-width", String(Math.round(width * factor * 100) / 100));
    });
  }

  // Everything that only matters to the live editor.
  clone.querySelectorAll("*").forEach((el) => {
    for (const name of Array.from(el.getAttributeNames())) {
      if (name === "style" || name === "class" || name.startsWith("data-") || name.startsWith("on") || name === "pointer-events" || name === "tabindex") el.removeAttribute(name);
    }
  });

  const ser = new XMLSerializer();
  return Array.from(clone.childNodes)
    .map((n) => ser.serializeToString(n))
    .join("")
    .replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, "");
}
