import "@xyflow/react/dist/style.css";
import "./styles.css";

import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Gordio viewer root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
