import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DocumentOrigin } from "./document-origin.service.js";
import type { ExtractionResult } from "./document-extraction.service.js";
import type { ParsedQuestion } from "./question-parser.service.js";
import { DocumentProcessingError } from "./document-processing-error.js";

type ReviewQuestion = ParsedQuestion & {
  id: string;
  status: "pending_review";
};

type ReviewResult = {
  documentId: string;
  status: "pending_review" | "no_questions";
  message: string;
  origin: DocumentOrigin;
  processedAt: string;
  pages: number;
  method: ExtractionResult["method"];
  sourceText: string;
  questions: ReviewQuestion[];
};

function reviewDirectory(): string {
  return process.env.MENTARY_REVIEW_DIRECTORY ?? resolve(process.cwd(), "uploads", "reviews");
}

/** Saves each processed document and its question candidates as a retrievable review record. */
async function saveReviewResult(
  origin: DocumentOrigin,
  extraction: ExtractionResult,
  parsedQuestions: ParsedQuestion[],
): Promise<ReviewResult> {
  if (!extraction.text.trim()) {
    throw new DocumentProcessingError("Não foi possível reconhecer texto no documento. Verifique a qualidade do arquivo e tente novamente.");
  }

  const questions: ReviewQuestion[] = parsedQuestions.map((question, index) => ({
    ...question,
    id: `${origin.id}-q${index + 1}`,
    status: "pending_review",
  }));
  const hasQuestions = questions.length > 0;
  const result: ReviewResult = {
    documentId: origin.id,
    status: hasQuestions ? "pending_review" : "no_questions",
    message: hasQuestions
      ? `${questions.length} questão(ões) foram identificadas e aguardam revisão.`
      : "Documento processado, mas nenhuma questão identificável foi encontrada.",
    origin,
    processedAt: new Date().toISOString(),
    pages: extraction.pages,
    method: extraction.method,
    sourceText: extraction.text,
    questions,
  };

  const directory = reviewDirectory();
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `${origin.id}.json`);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
  return result;
}

async function getReviewResult(documentId: string): Promise<ReviewResult | undefined> {
  if (!/^[\da-f-]{36}$/i.test(documentId)) return undefined;
  try {
    const content = await readFile(resolve(reviewDirectory(), `${documentId}.json`), "utf8");
    return JSON.parse(content) as ReviewResult;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

export { getReviewResult, saveReviewResult };
export type { ReviewQuestion, ReviewResult };
