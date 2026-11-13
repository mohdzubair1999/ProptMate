import React from "react"; import { createRoot } from "react-dom/client";
import SendReportForm from "../../app/dashboard/inspections/[id]/send-report-form.tsx"; import PropertyClientFields from "../../app/dashboard/properties/property-client-fields.tsx";
import SummaryReferenceSection from "../../app/dashboard/inspections/[id]/summary-reference-section.tsx"; import ClientsManager from "../../app/dashboard/settings/clients/clients-manager.tsx";
let root = null; const show = (el) => { if (root) root.unmount(); root = createRoot(document.getElementById("root")); root.render(el); }; const h = React.createElement;
window.mountSend = (p) => show(h(SendReportForm, { inspectionId: "i1", initialRecipients: [], defaultSubject: "Check-in — 2 Tudor House", reportFileName: "report.pdf", inspectionTypeLabel: "Check-in report", propertyAddress: "2 Tudor House", ...p }));
window.mountProp = (p) => show(h("form", { id: "f" }, h(PropertyClientFields, p), h("button", { type: "submit", id: "go" }, "Save")));
window.mountSummary = (p) => show(h(SummaryReferenceSection, { inspectionId: "insp1", initialValues: { clientName: null, clientAddress: null }, ...p }));
window.mountManager = (p) => show(h(ClientsManager, p));
