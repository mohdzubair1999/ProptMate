const made = new Set();
export async function updateQrIssueReportStatus(id, status) { (window.__qr = window.__qr || []).push(["status", id, status]); }
export async function createJobFromQrReport(id) { (window.__qr = window.__qr || []).push(["job", id]); if (id === "boom") throw new Error("Report not found"); const created = !made.has(id); made.add(id); return { created }; }
export async function submitQrIssueReport(propertyId, description, photoUrl, name, contact) { (window.__qr = window.__qr || []).push(["submit", propertyId, description, name || null, contact || null]); }
