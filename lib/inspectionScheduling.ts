export function computeNextInspection(
  inspections: { status: string; completedDate: Date | null; scheduledDate: Date | null }[],
  frequencyMonths: number | null
): { label: string; date: Date | null; urgent?: boolean } | null {
  if (inspections.length === 0) {
    // No inspections at all — either brand new, or every past one got deleted. A frequency
    // being set means someone DOES expect this property to be inspected regularly, so this
    // needs to be visible and actionable, not a silent blank.
    return frequencyMonths ? { label: "Never inspected — schedule now", date: null, urgent: true } : null;
  }
  const latest = inspections[0];

  // If the most recent inspection hasn't been completed yet, that IS the next one — show it
  // directly rather than computing a guess.
  if (latest.status !== "completed") {
    return latest.scheduledDate ? { label: "Scheduled", date: latest.scheduledDate } : { label: "In progress", date: null };
  }

  // Otherwise, only suggest a due date if a recurring frequency is actually set.
  if (!frequencyMonths || !latest.completedDate) return null;
  return { label: "Due", date: addMonthsClamped(latest.completedDate, frequencyMonths) };
}

// Plain setMonth() overflows into the next month when the target month is shorter (e.g. Jan
// 31 + 1 month becomes Mar 3, not Feb 28) — this clamps to the target month's actual last day.
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonthIndex = d.getMonth() + months;
  const firstOfTargetMonth = new Date(d.getFullYear(), targetMonthIndex, 1);
  const daysInTargetMonth = new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth() + 1, 0).getDate();
  firstOfTargetMonth.setDate(Math.min(d.getDate(), daysInTargetMonth));
  return firstOfTargetMonth;
}
