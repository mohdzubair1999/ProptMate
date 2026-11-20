// A draft list of maintenance jobs, built from what the inspector has ALREADY recorded in a mid-term inspection: answers rated
// urgent or with a deadline, safety checks answered "No", and damaged or worn inventory items. Plain code, no AI, so it only
// ever repeats the inspector's own answers (never invents a job), in priority order, ready to check and paste into the
// Maintenance report.

export type DraftSection = { title: string; fields: { label: string; type: string; value: string | null | undefined }[] };
export type DraftItem = { room: string; itemName: string; condition: string | null | undefined; notes: string | null | undefined };
export type Urgency = "urgent" | "28-days" | "routine" | "monitor";
export type MaintenanceJob = { urgency: Urgency; timeframe: string; area: string; text: string };

const RANK: Record<Urgency, number> = { urgent: 0, "28-days": 1, routine: 2, monitor: 3 };
export const MAX_JOBS = 40;

const URGENT = /urgent|within 7 days|emergency|immediate/i;
const DAYS28 = /within 28 days|28 days/i;
const MONITOR = /monitor|re-?check|keep an eye/i;
const SEVERITY_LABEL = /severity|priority|urgen|hazard/i;
// a question whose answer "No" means a check has FAILED (the polarity is clear): "Smoke alarms tested and working?"
const POSITIVE_CHECK = /\b(working|fitted|present|displayed|meets|installed|tested|in place|unobstructed|compliant|valid|in date|secure)\b/i;
// questions about people or access ("Tenant present?", "Access gained?") are not property checks, whatever the answer
const PEOPLE = /\b(tenants?|residents?|occupants?|landlords?|agents?|owners?|access|at home|attend\w*|available|keys?|met|contact\w*)\b/i;
const LIFE_SAFETY = /smoke|carbon|\bco\b|fire|gas|electric|escape|alarm/i;
const DETAIL_LABEL = /location|extent|notes?|where|details?|description|comments?/i;

const stripTags = (s: string) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 3).trimEnd()}...` : s);
export function areaName(title: string): string {
  const t = (title || "").replace(/^\s*health\s*(?:&|and)\s*safety review\s*[\u2014\u2013-]\s*/i, "").trim() || (title || "").trim() || "Inspection";
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const cleanLabel = (l: string) => l.replace(/\s*\?\s*$/, "").trim();

export function draftMaintenance(sections: DraftSection[], items: DraftItem[]): { jobs: MaintenanceJob[]; text: string } {
  const jobs: MaintenanceJob[] = [];
  const seen = new Set<string>();
  const add = (j: MaintenanceJob) => {
    const key = `${j.urgency}|${j.area}|${j.text}`.toLowerCase();
    if (seen.has(key) || jobs.length >= MAX_JOBS) return;
    seen.add(key);
    jobs.push(j);
  };

  for (const sec of Array.isArray(sections) ? sections : []) {
    if (!sec || !Array.isArray(sec.fields)) continue;
    const area = areaName(sec.title);
    const detailOf = () => {
      const parts: string[] = [];
      for (const f of sec.fields) {
        if ((f.type === "TEXT" || f.type === "SHORT_TEXT") && DETAIL_LABEL.test(f.label) && typeof f.value === "string") {
          const v = stripTags(f.value);
          if (v) parts.push(cut(v, 200));
        }
      }
      return parts.slice(0, 2).join(" - ");
    };
    for (const f of sec.fields) {
      if (!f || f.type !== "DROPDOWN" || typeof f.value !== "string" || !f.value.trim()) continue;
      const v = f.value.trim();
      // 1. a severity / priority answer with a deadline
      if (SEVERITY_LABEL.test(f.label) || /within \d+ ?days?|re-?check/i.test(v)) {
        const urgency: Urgency | null = URGENT.test(v) ? "urgent" : DAYS28.test(v) ? "28-days" : MONITOR.test(v) ? "monitor" : null;
        if (urgency) add({ urgency, timeframe: v, area, text: detailOf() || `${cleanLabel(f.label)}: ${v}` });
        continue;
      }
      // 2. a safety or compliance check answered "No"
      // "No", or an answer that starts with it such as "No, but gas appliances present" (but not "No concern", "None" or "Not applicable")
      if (/^no\b/i.test(v) && !/^no concern/i.test(v) && /\?\s*$/.test(f.label) && POSITIVE_CHECK.test(f.label) && !PEOPLE.test(f.label)) {
        const urgent = LIFE_SAFETY.test(f.label);
        add({ urgency: urgent ? "urgent" : "28-days", timeframe: urgent ? "Urgent - safety check not confirmed" : "Check not confirmed", area, text: `Not confirmed: ${cleanLabel(f.label)}` });
      }
    }
  }

  for (const it of Array.isArray(items) ? items : []) {
    if (!it) continue;
    const c = (it.condition ?? "").toString().trim().toLowerCase(), name = (it.itemName ?? "").toString().trim(), room = (it.room ?? "").toString().trim() || "Inventory";
    if (!name) continue;
    const note = it.notes ? cut(stripTags(String(it.notes)), 160) : "";
    if (c === "damaged") add({ urgency: "routine", timeframe: "Routine", area: room, text: `Repair or replace ${name}${note ? ` (${note})` : ""}` });
    else if (c === "beyond_economical_repair") add({ urgency: "routine", timeframe: "Routine", area: room, text: `Replace ${name}${note ? ` (${note})` : ""}` });
    else if (c === "worn") add({ urgency: "monitor", timeframe: "Monitor", area: room, text: `${name} is worn${note ? ` (${note})` : ""}` });
  }

  jobs.sort((a, b) => RANK[a.urgency] - RANK[b.urgency]); // stable: the order they appear in is kept within each group
  const text = jobs.map((j, i) => `${i + 1}. [${j.timeframe}] ${j.area}: ${j.text}`).join("\n");
  return { jobs, text };
}
