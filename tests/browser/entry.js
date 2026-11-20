import React from "react"; import { createRoot } from "react-dom/client"; import FloorPlanEditor from "../../app/dashboard/floor-plans/[propertyId]/floor-plan-editor.tsx";
window.mountEditor = (levels, propertyId, extra) => createRoot(document.getElementById("root")).render(React.createElement(FloorPlanEditor, { propertyId, initialLevels: levels, ...(extra || {}) }));
