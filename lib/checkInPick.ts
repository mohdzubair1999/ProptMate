// Choosing which check-in a later inspection (a check-out, a mid-term) is compared with. Pure (no database), so every rule is tested directly.
export type MatchedCheckIn = { id: string; completedDate: Date | null };
export type CheckInCandidate = { id: string; status: string; completedDate: Date | null; firstCompletedDate: Date | null };

// The newest check-in at or before `cutoff`. A check-in that is being EDITED (taken back to draft after it was completed) still counts, as of the date it was first completed:
// otherwise, while someone corrects a check-in, a check-out would quietly be compared with an OLDER tenancy's check-in instead. One that was never completed does not count.
export function pickMatchingCheckIn(candidates: CheckInCandidate[], cutoff: Date): MatchedCheckIn | null {
  let best: { id: string; at: Date } | null = null;
  for (const c of Array.isArray(candidates) ? candidates : []) {
    if (!c) continue;
    const at = c.status === "completed" ? c.completedDate : c.firstCompletedDate;
    if (!(at instanceof Date) || !Number.isFinite(at.getTime()) || at.getTime() > cutoff.getTime()) continue;
    if (!best || at.getTime() > best.at.getTime() || (at.getTime() === best.at.getTime() && c.id < best.id)) best = { id: c.id, at };
  }
  return best ? { id: best.id, completedDate: best.at } : null;
}
