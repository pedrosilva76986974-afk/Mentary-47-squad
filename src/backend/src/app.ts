import { questionBankRouter } from "./routes/question-bank.routes.js";
import express from "express";
import { ReviewConflictError } from "./services/review-conflict.js";
import { AssessmentConflictError } from "./services/assessment.service.js";
import { assessmentsRouter } from "./routes/assessments.routes.js";
import multer from "multer";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { documentsRouter } from "./routes/documents.routes.js";
import { DocumentValidationError } from "./services/document-validation.service.js";
import { DocumentProcessingError } from "./services/document-processing-error.js";

const app = express();
const frontendPath = resolve(dirname(fileURLToPath(import.meta.url)), "../public");

app.use("/assessments", express.json({ limit: "2mb" }), assessmentsRouter);
app.use(express.json({ limit: "100kb" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/documents", documentsRouter);
app.use("/questions", questionBankRouter);
app.use(express.static(frontendPath));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const bodyError = error as { type?: string } | null;
  if (error instanceof ReviewConflictError || error instanceof AssessmentConflictError) {
    res.status(409).json({ error: error.message, code: error instanceof ReviewConflictError ? "REVIEW_CONFLICT" : "ASSESSMENT_CONFLICT" });
    return;
  }
  if (bodyError?.type === "entity.parse.failed") {
    res.status(400).json({ error: "O corpo da requisição deve conter JSON válido." });
    return;
  }
  if (bodyError?.type === "entity.too.large") {
    res.status(413).json({ error: "O corpo JSON excede o limite permitido (100 KB; avaliações: 2 MB)." });
    return;
  }
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "O arquivo excede o limite de 20 MB." });
    return;
  }

  if (error instanceof DocumentValidationError || error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof DocumentProcessingError) {
    res.status(422).json({ error: error.message });
    return;
  }

  res.status(500).json({ error: "Falha ao registrar ou processar o documento. Tente novamente." });
});

export { app };
