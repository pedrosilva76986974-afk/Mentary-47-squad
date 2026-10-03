import express from "express";
import multer from "multer";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { documentsRouter } from "./routes/documents.routes.js";
import { DocumentValidationError } from "./services/document-validation.service.js";
import { DocumentProcessingError } from "./services/document-processing-error.js";

const app = express();
const frontendPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../frontend");

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/documents", documentsRouter);
app.use(express.static(frontendPath));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
