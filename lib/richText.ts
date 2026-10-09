// Shared between the rich-text Comments editor, both PDF documents, and anywhere a Comments
// value is fed somewhere that can't render HTML (an AI prompt, a CSV, etc).
//
// Storage format: a small, deliberately restricted set of HTML - <b>, <i>, <u>, <span
// style="font-size:Npx">, <ul><li>, <p>/<div>, <br>. A value with none of these tags is older
// plain text (or something typed with no formatting) and is handled as plain text everywhere.

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "SPAN", "UL", "LI", "P", "DIV", "BR"]);
const BOLD_TAGS = new Set(["B", "STRONG"]);
const ITALIC_TAGS = new Set(["I", "EM"]);

export function isRichText(value: string): boolean {
  return /<\/?(b|strong|i|em|u|span|ul|li|p|div|br)\b/i.test(value);
}

// Only ever used client-side (DOMParser isn't available server-side) - rebuilds the HTML from
// scratch, keeping only the allowed tags and, on a <span>, only a font-size style - everything
// else (scripts, event handler attributes, unknown tags, external content) is dropped rather
// than escaped, so there's nothing left to parse unsafely later, by this app or any other.
export function sanitizeRichText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  function clean(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const span = document.createElement("span");
      span.textContent = node.textContent || "";
      return span.innerHTML; // escapes any literal < > & in typed text
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as Element;
    const inner = Array.from(el.childNodes).map(clean).join("");
    if (!ALLOWED_TAGS.has(el.tagName)) return inner; // drop the wrapper, keep its text
    if (el.tagName === "BR") return "<br>";
    if (el.tagName === "SPAN") {
      const size = el.getAttribute("style")?.match(/font-size:\s*(\d+)px/i)?.[1];
      return size ? `<span style="font-size:${size}px">${inner}</span>` : inner;
    }
    const tag = el.tagName.toLowerCase();
    return `<${tag}>${inner}</${tag}>`;
  }

  return Array.from(doc.body.childNodes).map(clean).join("");
}

// A clean, readable plain-text rendering for anywhere HTML can't be shown: an AI prompt, a plain
// an email body, etc. Paragraph/line breaks become real newlines, bullets become "- " lines.
export function richTextToPlainText(html: string): string {
  if (typeof document === "undefined") return serverStripHtml(html);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const lines: string[] = [];
  let current = "";

  function walk(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      current += node.textContent || "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.tagName === "BR") {
      lines.push(current);
      current = "";
      return;
    }
    if (el.tagName === "LI") {
      const before = current;
      current = "";
      Array.from(el.childNodes).forEach(walk);
      lines.push(`- ${current.trim()}`);
      current = before;
      return;
    }
    Array.from(el.childNodes).forEach(walk);
    if (el.tagName === "P" || el.tagName === "DIV" || el.tagName === "UL") {
      if (current.trim()) lines.push(current);
      current = "";
    }
  }

  Array.from(doc.body.childNodes).forEach(walk);
  if (current.trim()) lines.push(current);
  return lines.join("\n").trim();
}

// Server-side fallback (API routes have no DOMParser) - same output, via regex instead of a real
// DOM. Good enough for the one-way "strip formatting for an AI prompt" use case; sanitizing user
// input for safe rendering is a client-only operation (sanitizeRichText above) and never needed
// server-side, since nothing server-side ever renders this HTML back out.
function serverStripHtml(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<\/(li|p|div)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export { BOLD_TAGS, ITALIC_TAGS };
