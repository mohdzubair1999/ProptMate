// A small, purpose-built parser for the restricted HTML lib/richText.ts's sanitizer produces -
// not a general HTML parser. Runs server-side (PDF generation has no DOMParser), so it can't
// reuse the browser-based walker in lib/richText.ts.

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; fontSize?: number };
export type Block = { type: "p" | "li"; runs: Run[] };

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

  const pushRun = (text: string) => {
    if (!text) return;
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
    }
    // any other/unknown tag: ignored, same as the sanitizer dropping it
  }
  if (hasContent || current.runs.length > 0) blocks.push(current);

  // Trailing-empty-paragraph cleanup: a trailing <br> or an empty final <div> from how browsers
  // serialize contentEditable shouldn't render as a blank paragraph at the end.
  while (blocks.length > 0 && blocks[blocks.length - 1].runs.every((r) => !r.text.trim())) blocks.pop();

  return blocks;
}
