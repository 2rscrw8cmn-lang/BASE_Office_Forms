import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "../styles/app.css";

interface ReactBootstrapWindow extends Window {
  __BASE_REACT_APP_HOST__?: boolean;
}

// React now owns the application shell. The flag keeps the legacy
// public/app-shell.js self-boot guard satisfied (it never auto-starts when the
// React host is present); that module remains served only as a rollback path.
(window as ReactBootstrapWindow).__BASE_REACT_APP_HOST__ = true;

const root = document.getElementById("react-app");

if (!root) {
  throw new Error("The React application root was not found.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
