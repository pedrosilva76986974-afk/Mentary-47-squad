import type { Request, Response, NextFunction } from "express";
import { extractDocument } from "../services/document-extraction.service.js";
import { getStoredDocument, recordDocumentOrigin, removeDocumentOrigin } from "../services/document-origin.service.js";
import { validateDocument } from "../services/document-validation.service.js";
import { identifyQuestionsDetailed } from "../services/question-identification.service.js";
import { getReviewResult, saveReviewResult, updateReviewQuestion, type ReviewResult } from "../services/review-results.service.js";

async function uploadAndExtract(req: Request, res: Response, next: NextFunction): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "Envie um arquivo PDF, PNG, JPG ou JPEG no campo 'document'." });
    return;
  }

  try {
    await validateDocument(file);
    const extractionStartedAt = Date.now();
    const result = await extractDocument(file.buffer, file.mimetype);
    const extractionDurationMs = Date.now() - extractionStartedAt;
    const identification = await identifyQuestionsDetailed(result.pageTexts);
    const origin = await recordDocumentOrigin(file);
    let review: ReviewResult;
    try {
      review = await saveReviewResult(origin, result, identification.questions, {
        ...identification.diagnostics,
        extractionDurationMs,
      });
    } catch (error) {
      try {
        await removeDocumentOrigin(origin.id);
      } catch (rollbackError) {
        console.error("Falha ao remover a origem após erro ao salvar a revisão.", rollbackError);
      }
      throw error;
    }
    res.status(200).json({
      status: review.status,
      message: review.message,
      origin,
      sourceUrl: `/documents/${origin.id}/source`,
      pages: result.pages,
      method: result.method,
      identification: review.identification,
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

async function updateDocumentReviewQuestion(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const documentParameter = req.params.documentId;
    const questionParameter = req.params.questionId;
    const documentId = Array.isArray(documentParameter) ? documentParameter[0] ?? "" : documentParameter ?? "";
    const questionId = Array.isArray(questionParameter) ? questionParameter[0] ?? "" : questionParameter ?? "";
    const review = await updateReviewQuestion(documentId, questionId, req.body);
    if (!review) {
      res.status(404).json({ error: "Questão ou registro de revisão não encontrado." });
      return;
    }
    res.json(review);
  } catch (error) {
    next(error);
  }
}

async function getDocumentSource(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parameter = req.params.documentId;
    const documentId = Array.isArray(parameter) ? parameter[0] ?? "" : parameter ?? "";
    const document = await getStoredDocument(documentId);
    if (!document) {
      res.status(404).json({ error: "Documento original não encontrado ou expirado." });
      return;
    }
    res.type(document.origin.mimeType).set("Content-Disposition", "inline").send(document.content);
  } catch (error) {
    next(error);
  }
}

export { getDocumentReview, getDocumentSource, updateDocumentReviewQuestion, uploadAndExtract };
