import type { Request, Response, NextFunction } from "express";
import { extractDocument } from "../services/document-extraction.service.js";
import { recordDocumentOrigin } from "../services/document-origin.service.js";
import { validateDocument } from "../services/document-validation.service.js";
import { parseQuestions } from "../services/question-parser.service.js";
import { getReviewResult, saveReviewResult } from "../services/review-results.service.js";

async function uploadAndExtract(req: Request, res: Response, next: NextFunction): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Envie um arquivo PDF, PNG, JPG ou JPEG no campo 'document'." });
    return;
  }

  try {
    await validateDocument(file);
    const origin = await recordDocumentOrigin(file);
    const result = await extractDocument(file.buffer, file.mimetype);
    const questions = parseQuestions(result.pageTexts);
    const review = await saveReviewResult(origin, result, questions);
    res.status(200).json({
      status: review.status,
      message: review.message,
      origin,
      pages: result.pages,
      method: result.method,
      text: result.text,
      questionCount: review.questions.length,
      questions: review.questions,
      reviewUrl: `/documents/${origin.id}/review`,
    });
  } catch (error) {
    next(error);
  }
}

async function getDocumentReview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parameter = req.params.documentId;
    const documentId = Array.isArray(parameter) ? parameter[0] ?? "" : parameter ?? "";
    const review = await getReviewResult(documentId);
    if (!review) {
      res.status(404).json({ error: "Resultado de revisão não encontrado." });
      return;
    }
    res.json(review);
  } catch (error) {
    next(error);
  }
}

export { getDocumentReview, uploadAndExtract };
