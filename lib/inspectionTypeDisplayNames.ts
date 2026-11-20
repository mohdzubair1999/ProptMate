// Shared between the email feature and report filename generation, so the human-readable
// name for each inspection type stays identical everywhere it's shown rather than risking two
// separate copies drifting out of sync over time.
export const INSPECTION_TYPE_DISPLAY_NAMES: Record<string, string> = {
  "check-in": "Check-in Report",
  "check-out": "Check-out Report",
  "mid-term": "Mid-term Inspection Report",
  hmo: "HMO Inspection Report",
  legionella: "Legionella Risk Assessment",
  maintenance: "Maintenance Report",
};

export function inspectionTypeDisplayName(type: string): string {
  return INSPECTION_TYPE_DISPLAY_NAMES[type] || `${type} Report`;
}
