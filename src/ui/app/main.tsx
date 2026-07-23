import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LegacyApplicationHost } from "./LegacyApplicationHost";
import "../styles/app.css";

const root = document.getElementById("react-app");

if (!root) {
  throw new Error("The React application root was not found.");
}

createRoot(root).render(
  <StrictMode>
    <LegacyApplicationHost />
  </StrictMode>,
);
