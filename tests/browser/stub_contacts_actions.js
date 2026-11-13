const rec = (fn, args) => { (window.__calls = window.__calls || []).push({ fn, args }); };
export async function sendReportForAcknowledgement(prev, fd) { rec("sendReportForAcknowledgement", { emails: fd.getAll("recipientEmails"), names: fd.getAll("recipientNames") }); return { sent: fd.getAll("recipientEmails").length }; }
export async function saveSummaryReferenceField(id, key, value) { rec("saveSummaryReferenceField", [id, key, value]); }
export async function saveClientContact(prev, fd) { rec("saveClientContact", Object.fromEntries([...fd.entries()])); return window.__mode === "error" ? { error: "A client called X is already saved" } : { saved: true }; }
export async function deleteClientContact(fd) { rec("deleteClientContact", Object.fromEntries([...fd.entries()])); }
export async function forgetRememberedAddress(fd) { rec("forgetRememberedAddress", Object.fromEntries([...fd.entries()])); }
export async function queueWrite(w) { rec("queueWrite", w); }
