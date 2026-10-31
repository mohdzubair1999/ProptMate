// CSV files for Excel and Google Sheets. Two things matter beyond the basic quoting:
//  1. Spreadsheet formula injection. A cell that starts with =, +, - or @ (or a tab or carriage return) is run as a FORMULA when the file
//     is opened, so text a tenant or inspector typed could run code or leak data. Such cells are prefixed with an apostrophe, which
//     makes the spreadsheet show them as plain text.
//  2. Excel needs a byte-order mark to read accents and symbols (é, £) correctly.
// Pure (no database), so every rule is tested directly.

const DANGEROUS_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (value instanceof Date) s = isNaN(+value) ? "" : value.toISOString();
  else s = String(value);
  // control characters other than newline and tab have no place in a spreadsheet cell
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  if (DANGEROUS_START.test(s)) s = `'${s}`;
  // quote when it holds a comma, a quote, or a line break; double any quotes inside
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_BOM = "\uFEFF";
export function toCsv(rows: unknown[][]): string {
  return CSV_BOM + (Array.isArray(rows) ? rows : []).map((r) => (Array.isArray(r) ? r : []).map(csvCell).join(",")).join("\r\n") + "\r\n";
}
export const safeFileName = (s: string, fallback = "export") => (String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || fallback);
