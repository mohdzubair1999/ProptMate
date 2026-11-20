// A small, purpose-built parser for the restricted HTML lib/richText.ts's sanitizer produces -
// not a general HTML parser. Runs server-side (PDF generation has no DOMParser), so it can't
// reuse the browser-based walker in lib/richText.ts.

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; fontSize?: number };
// `spaceBefore` marks a gap the writer left on purpose - a blank line between two lines, or a real paragraph break.
// An ordinary new line (Enter, or a line break) is just the next line: it has no gap, exactly as it looks in the
// Comments box. (Every new line used to be treated as a paragraph with a gap of its own, so a comment typed one
// line per bullet printed with every line floating apart.)
export type Block = { type: "p" | "li"; runs: Run[]; spaceBefore?: boolean };

const ENTITY_MAP: Record<string, string> = { amp: "&", lt: "<", gt: ">", nbsp: " ", quot: '"', "#39": "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|nbsp|quot|#39);/g, (_m, name) => ENTITY_MAP[name] ?? _m);
}

export function parseRichText(html: string): Block[] {
  const blocks: Block[] = [];
  let current: Block = { type: "p", runs: [] };
  let hasContent = false; // tracks whether `current` has anything, incl. after tags with no visible text yet

  const flags = { bold: 0, italic: 0, underline: 0 };
  const sizeStack: number[] = [];
  let blankPending = false; // a deliberate gap is waiting to be given to the next block that has something in it

  const pushRun = (text: string) => {
    if (!text) return;
    if (blankPending && current.runs.length === 0) {
      if (blocks.length > 0 && !(current.type === "li" && blocks[blocks.length - 1].type === "li")) current.spaceBefore = true;
      blankPending = false;
    }
    current.runs.push({
      text,
      bold: flags.bold > 0 || undefined,
      italic: flags.italic > 0 || undefined,
      underline: flags.underline > 0 || undefined,
      fontSize: sizeStack.length > 0 ? sizeStack[sizeStack.length - 1] : undefined,
    });
    hasContent = true;
  };

  const startBlock = (type: "p" | "li") => {
    if (hasContent || current.runs.length > 0) blocks.push(current);
    current = { type, runs: [] };
    hasContent = false;
  };

  // Tokenize into tags and the text between them.
  const tokens = html.split(/(<[^>]+>)/g).filter((t) => t.length > 0);
  for (const token of tokens) {
    if (!token.startsWith("<")) {
      pushRun(decodeEntities(token));
      continue;
    }
    const closing = token.startsWith("</");
    const tag = token.replace(/^<\/?/, "").replace(/[\s/>][\s\S]*$/, "").toLowerCase();

    if (tag === "br") {
      // A line break after some text just ends that line. One where nothing is on the line yet (two in a row, or
      // an empty line in the Comments box) is a blank line the writer left.
      if (!hasContent && current.runs.length === 0 && blocks.length > 0) blankPending = true;
      startBlock("p");
    } else if (tag === "b" || tag === "strong") {
      flags.bold += closing ? -1 : 1;
    } else if (tag === "i" || tag === "em") {
      flags.italic += closing ? -1 : 1;
    } else if (tag === "u") {
      flags.underline += closing ? -1 : 1;
    } else if (tag === "span") {
      if (closing) {
        sizeStack.pop();
      } else {
        const size = token.match(/font-size:\s*(\d+)px/i)?.[1];
        sizeStack.push(size ? parseInt(size, 10) : (sizeStack[sizeStack.length - 1] ?? 10));
      }
    } else if (tag === "li") {
      startBlock(closing ? "p" : "li");
    } else if (tag === "p" || tag === "div" || tag === "ul") {
      startBlock("p");
      // A real paragraph, or a list set off from the text before or after it, keeps a small gap. A <div> is only a
      // line - that is what the Comments box makes when Enter is pressed - so it gets none.
      if (tag === "p" && !closing && blocks.length > 0) blankPending = true;
      if (tag === "ul" && blocks.length > 0 && (closing || blocks[blocks.length - 1].type !== "li")) blankPending = true;
    }
    // any other/unknown tag: ignored, same as the sanitizer dropping it
  }
  if (hasContent || current.runs.length > 0) blocks.push(current);

  // Trailing-empty-paragraph cleanup: a trailing <br> or an empty final <div> from how browsers
  // serialize contentEditable shouldn't render as a blank paragraph at the end.
  while (blocks.length > 0 && blocks[blocks.length - 1].runs.every((r) => !r.text.trim())) blocks.pop();

  return blocks;
}
