import { Workspace } from "./components/Workspace.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Não foi possível iniciar a interface do Mentary.");
}

createRoot(rootElement).render(
  <StrictMode>
    <Workspace />
  </StrictMode>,
);
