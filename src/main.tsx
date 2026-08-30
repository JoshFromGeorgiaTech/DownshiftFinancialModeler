import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import ScenarioModeler from "./ScenarioModeler.js";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root element not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ScenarioModeler />
  </React.StrictMode>
);
