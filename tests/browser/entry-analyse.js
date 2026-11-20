import React from "react"; import { createRoot } from "react-dom/client";
import Analyse from "../../components/AnalyzePhotoButton.tsx";
let root = null;
window.mountAnalyse = (props) => { root = createRoot(document.getElementById("root")); root.render(React.createElement(Analyse, props)); };
window.unmountAnalyse = () => { if (root) { root.unmount(); root = null; } }; // what leaving the page does to the button
