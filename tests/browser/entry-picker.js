import React from "react"; import { createRoot } from "react-dom/client";
import SearchableSelect from "../../components/SearchableSelect.tsx"; import NewInspectionForm from "../../app/dashboard/inspections/new/new-inspection-form.tsx";
import InviteClientForm from "../../app/dashboard/tenants/invite-client-form.tsx"; import AddDoc from "../../app/dashboard/compliance/add-document-form.tsx";
let root = null; const show = (el) => { if (root) root.unmount(); root = createRoot(document.getElementById("root")); root.render(el); };
const h = React.createElement;
function Standalone({ cfg }) {
  const [v, setV] = React.useState(cfg.initial ?? "");
  const common = { options: cfg.options, name: "choice", id: "pick", ariaLabel: "Property", noun: "property", nounPlural: "properties", required: !!cfg.required, emptyLabel: cfg.emptyLabel, placeholder: "Search…" };
  const picker = cfg.controlled ? h(SearchableSelect, { ...common, value: v, onChange: (x) => { setV(x); window.__state = x; } }) : h(SearchableSelect, { ...common, defaultValue: cfg.initial, onChange: (x) => { window.__state = x; } });
  return h("form", { id: "f", onSubmit: (e) => { e.preventDefault(); window.__submitted = (window.__submitted || 0) + 1; window.__fd = Object.fromEntries(new FormData(e.currentTarget).entries()); } }, picker, h("button", { type: "submit", id: "go" }, "Go"), h("button", { type: "button", id: "ext", onClick: () => setV(cfg.externalValue ?? "") }, "Set from outside"), h("input", { id: "after", placeholder: "next field" }));
}
window.mountPicker = (cfg) => show(h(Standalone, { cfg }));
window.mountNewInspection = (props) => show(h(NewInspectionForm, props));
window.mountInvite = (props) => show(h(InviteClientForm, props));
window.mountAddDoc = (props) => show(h(AddDoc, props));
