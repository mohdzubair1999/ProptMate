import React from "react"; import { createRoot } from "react-dom/client";
import List from "../../app/dashboard/properties/[id]/qr-issue-reports-list.tsx"; import Form from "../../app/qr/[propertyId]/qr-report-form.tsx";
window.mountList = (reports) => createRoot(document.getElementById("root")).render(React.createElement(List, { reports }));
window.mountForm = () => createRoot(document.getElementById("root")).render(React.createElement(Form, { propertyId: "prop1" }));
