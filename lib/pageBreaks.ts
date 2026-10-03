// Planning logic for tidying page breaks in templates - kept separate from the database action
// so it can be tested directly against real-shaped data.
//
// The rule: a page break belongs AFTER a section ends, never inside it. Every template script
// ends each section with one, so each section starts on a fresh page. A break sitting between a
// room's item list and its Comments is a leftover: Comments and Photos were added to existing
// rooms later (add-comments-photos-to-inventory-rooms.js appends fields at the END of a
// section), which put them after the break that used to close the room. In the PDF that break is
// an unconditional "start a new page", so every such room left its item list alone on one
// page and pushed Comments onto the next - the blank gaps.

export type PlanField = { id: string; type: string; order: number; hidden: boolean };
export type PlanSection = { id: string; fields: PlanField[] };
export type PageBreakPlan = {
  moves: { id: string; order: number }[]; // a break to re-order so it becomes the section's last field
  deletes: string[]; // extra breaks that would be left over after moving one
};

const isBreak = (f: PlanField) => f.type === "PAGE_BREAK";

export function planPageBreakFixes(sections: PlanSection[]): PageBreakPlan {
  const moves: PageBreakPlan["moves"] = [];
  const deletes: string[] = [];

  for (const section of sections) {
    const ordered = [...section.fields].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    // Hidden fields never render, so only what the report would actually show decides whether a
    // break is "inside" - a break followed only by hidden fields is already effectively at the end.
    const visible = ordered.filter((f) => !f.hidden);

    const firstContent = visible.findIndex((f) => !isBreak(f));
    let lastContent = -1;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (!isBreak(visible[i])) {
        lastContent = i;
        break;
      }
    }
    if (firstContent === -1) continue; // nothing but breaks (or nothing at all)

    // Inside = real content both before and after it. A break at the very start or very end of a
    // section is already at a section boundary, so it is left alone.
    const inside = visible.filter((f, i) => isBreak(f) && i > firstContent && i < lastContent);
    if (inside.length === 0) continue;

    if (isBreak(visible[visible.length - 1])) {
      deletes.push(...inside.map((f) => f.id)); // the section already ends with one - the inside ones are just extra
    } else {
      const maxOrder = Math.max(...ordered.map((f) => f.order));
      moves.push({ id: inside[0].id, order: maxOrder + 1 });
      deletes.push(...inside.slice(1).map((f) => f.id));
    }
  }

  return { moves, deletes };
}
