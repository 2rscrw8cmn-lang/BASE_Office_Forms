/*
 * UI Lab entry point. Only vite.lab.config.ts references this module, so it is
 * never included in the production application bundle emitted to public/app/.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UiLab } from "./UiLab";

const root = document.getElementById("ui-lab-root");

if (!root) {
  throw new Error("The UI Lab root element was not found.");
}

createRoot(root).render(
  <StrictMode>
    <UiLab />
  </StrictMode>,
);
