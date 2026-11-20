const rec = (fn, fd) => { (window.__subs = window.__subs || []).push({ fn, data: Object.fromEntries([...fd.entries()].map(([k, v]) => [k, typeof v === "string" ? v : "[file]"])) }); };
export async function createInspection(prev, fd) { rec("createInspection", fd); return window.__mode === "error" ? { error: "That did not work" } : {}; }
export async function inviteClient(prev, fd) { rec("inviteClient", fd); return window.__mode === "error" ? { error: "Could not invite" } : {}; }
export async function addComplianceDocument(fd) { rec("addComplianceDocument", fd); }
