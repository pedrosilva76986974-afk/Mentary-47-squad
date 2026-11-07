import { QuestionBank } from "./pages/QuestionBank.js";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./pages/App";
import "../styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Não foi possível iniciar a interface do Mentary.");
}

createRoot(rootElement).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has("bank") ? <QuestionBank /> : <App />}
  </StrictMode>,
);
