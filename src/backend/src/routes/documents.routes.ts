import { getStoredDocument } from "../services/document-origin.service.js";
import { renderSourcePreview } from "../services/source-preview.service.js";
import { Router } from "express";
import multer from "multer";
import {
  getDocumentReview,
  getDocumentSource,
  updateDocumentReviewQuestion,
  uploadAndExtract,
} from "../controllers/documents.controller.js";
import { limitConcurrentUploads } from "../middlewares/upload-concurrency.middleware.js";
import { DocumentValidationError } from "../services/document-validation.service.js";
import {
  startClassification,
  getClassification,
  classificationIsStale,
  cancelClassification,
} from "../services/pedagogical-classification.service.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.mimetype)) {
      callback(new DocumentValidationError("Formato inválido. Envie PDF, PNG ou JPG."));
      return;
    }
    callback(null, true);
  },
});

router.post("/", limitConcurrentUploads, upload.single("document"), uploadAndExtract);
router.get("/:documentId/review", getDocumentReview);
router.get("/:documentId/source", getDocumentSource);
router.get("/:documentId/preview", async (req, res) => {
  const document = await getStoredDocument(String(req.params.documentId));
  if (!document) {
    res.status(404).json({ error: "Documento original indisponível ou expirado." });
    return;
  }
  const value = (key: string, fallback: number) =>
    req.query[key] === undefined ? fallback : Number(req.query[key]);
  const image = await renderSourcePreview(document.content, document.origin.mimeType, value("page", 1), {
    x: value("x", 0),
    y: value("y", 0),
    width: value("width", 1),
    height: value("height", 1),
  });
  res.type("png").send(image);
});
router.post("/:documentId/classification", async (req, res) => {
  const job = await startClassification(String(req.params.documentId));
  if (!job) {
    res.status(404).json({ error: "Revisão não encontrada." });
    return;
  }
  res.status(202).json(job);
});
router.get("/:documentId/classification", async (req, res) => {
  const job = await getClassification(String(req.params.documentId));
  if (!job) {
    res.status(404).json({ error: "Análise não encontrada." });
    return;
  }
  res.json({
    ...job,
    stale: await classificationIsStale(String(req.params.documentId), job),
  });
});
router.post("/:documentId/classification/cancel", async (req, res) => {
  const job = await cancelClassification(String(req.params.documentId));
  if (!job) {
    res.status(404).json({ error: "Análise não encontrada." });
    return;
  }
  res.json(job);
});
router.patch("/:documentId/review/questions/:questionId", updateDocumentReviewQuestion);

export { router as documentsRouter };
