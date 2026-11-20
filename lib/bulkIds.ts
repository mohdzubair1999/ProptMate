// The ids ticked on a list, cleaned: text only, no blanks, no repeats, at most `max` of them. Pure.
export function cleanIds(values: unknown, max: number = 500): string[] {
  const arr = Array.isArray(values) ? values : [];
  const out = new Set<string>();
  for (const v of arr) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t && t.length <= 64) out.add(t);
    if (out.size >= max) break;
  }
  return [...out];
}
