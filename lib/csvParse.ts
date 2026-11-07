// Reads a spreadsheet saved as CSV (or copied out of Excel or Google Sheets). Handles what real files do: a byte-order mark, Windows or Mac
// line endings, quoted cells with commas, doubled quotes and line breaks inside them, and a semicolon or tab instead of a comma (UK Excel
// often saves with semicolons; copying from a sheet gives tabs). Never throws.

export const MAX_IMPORT_BYTES = 1_000_000;
export const MAX_IMPORT_ROWS = 500; // data rows, not counting the header
export const MAX_IMPORT_COLUMNS = 30;
export type ParsedCsv = { rows: string[][]; delimiter: "," | ";" | "\t"; truncated: boolean; error: string | null };

const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
// our own exports put an apostrophe in front of text that a spreadsheet would read as a formula: take it off again on the way back in
const unprotect = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

// How many cells each of the first few lines has when split on this separator (quotes respected).
function columnCounts(lines: string[], sep: string): number[] {
  return lines.map((line) => {
    let inQ = false, n = 1;
    for (const ch of line) {
      if (ch === '"') inQ = !inQ;
      else if (!inQ && ch === sep) n++;
    }
    return n;
  });
}
// The separator is the one that splits the first rows into the SAME number of columns (more than one). A separator that merely appears
// more often in a header cell or a note does not win, because it will not split every row the same way. Ties go to comma.
function detectDelimiter(text: string): "," | ";" | "\t" {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "").slice(0, 10);
  let best: "," | ";" | "\t" = ",", bestScore = -1;
  for (const sep of [",", "\t", ";"] as const) {
    const counts = columnCounts(lines, sep);
    const target = counts[0];
    const score = target > 1 ? counts.filter((c) => c === target).length * 1000 + target : 0;
    if (score > bestScore) { best = sep; bestScore = score; }
  }
  return best;
}

export function parseCsv(input: unknown): ParsedCsv {
  const empty = (error: string | null): ParsedCsv => ({ rows: [], delimiter: ",", truncated: false, error });
  if (typeof input !== "string") return empty("There is nothing to read.");
  if (input.length > MAX_IMPORT_BYTES) return empty("That file is too large. Split it into smaller files of up to 500 properties each.");
  const text = clean(input.charCodeAt(0) === 0xfeff ? input.slice(1) : input).replace(/\u2028|\u2029/g, "\n");
  if (text.trim() === "") return empty("There is nothing to read.");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false, truncated = false;
  // A blank row is kept as an empty placeholder (not dropped), so the position of every row is preserved and "row 5" in a message is row 5
  // of the spreadsheet. Blank rows at the very end are removed afterwards.
  const endRow = () => {
    row.push(cell);
    cell = "";
    rows.push(row.some((c) => c.trim() !== "") ? row.slice(0, MAX_IMPORT_COLUMNS).map((c) => unprotect(c.trim())) : []);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += ch;
    } else if (ch === '"' && cell.trim() === "") { q = true; cell = ""; }
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
      if (rows.length > MAX_IMPORT_ROWS + 1) { truncated = true; break; }
    } else cell += ch;
  }
  if (q) return empty("A quoted value is never closed. Check for a stray quotation mark (\") in the file.");
  if (!truncated && (cell !== "" || row.length > 0)) endRow();
  if (rows.length > MAX_IMPORT_ROWS + 1) { rows.length = MAX_IMPORT_ROWS + 1; truncated = true; }
  while (rows.length > 0 && rows[rows.length - 1].length === 0) rows.pop(); // no trailing blank rows
  return { rows, delimiter, truncated, error: rows.length === 0 ? "There is nothing to read." : null };
}
