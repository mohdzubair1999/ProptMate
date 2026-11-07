export async function saveFloorPlan(...a) { (window.__saves = window.__saves || []).push(JSON.parse(JSON.stringify(a))); return { ok: true }; }
export async function enableFloorPlanSharing() { return { token: "T".repeat(32), expiresAt: null }; }
export async function disableFloorPlanSharing() { return {}; }
export async function setFloorPlanShareExpiry() { return { expiresAt: null }; }
export async function deleteFloorPlan() { return {}; }
