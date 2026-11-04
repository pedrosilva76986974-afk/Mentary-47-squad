import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { DocumentOrigin } from "./document-origin.service.js";
import type { ExtractionResult, VisualPageReference } from "./document-extraction.service.js";
import type { ParsedQuestion } from "./question-parser.service.js";
import { DocumentProcessingError } from "./document-processing-error.js";
import { DocumentValidationError } from "./document-validation.service.js";
import type { IdentificationDiagnostics } from "./question-identification.service.js";
import { initializeDatabase, isDatabaseConfigured } from "./database.service.js";
import {
  deleteReviewResultFromDatabase,
  getReviewResultFromDatabase,
  importLegacyReviewResult,
  saveReviewResultToDatabase,
} from "./postgres-review.service.js";

type ReviewQuestion = ParsedQuestion & {
  id: string;
  status: "pending_review" | "approved" | "rejected";
  answerKey?: string | null;
  pedagogy?: {
    discipline?: string;
    grade?: string;
    topic?: string;
    bnccSkills?: string[];
    descriptor?: string;
    difficulty?: "easy" | "medium" | "hard" | "unknown";
    userId?: string;
    institutionId?: string;
  };
  reviewedBy?: string | null;
  visualReferences?: VisualPageReference[];
};

type ReviewQuestionUpdate = Partial<Pick<ReviewQuestion,
  "prompt" | "answerKey" | "alternatives" | "status" | "pedagogy" | "reviewedBy"
>>;

type PedagogyMetadata = NonNullable<ReviewQuestion["pedagogy"]>;

type ReviewResult = {
  documentId: string;
  status: "pending_review" | "no_questions";
  message: string;
  origin: DocumentOrigin;
  processedAt: string;
  pages: number;
  method: ExtractionResult["method"];
  sourceText: string;
  identification?: IdentificationDiagnostics;
  questions: ReviewQuestion[];
};

function findQuestionVisualReferences(
  question: Pick<ReviewQuestion, "pageStart" | "pageEnd">,
  visualPages: VisualPageReference[] = [],
): VisualPageReference[] {
  return visualPages.filter(({ page }) => page >= question.pageStart && page <= question.pageEnd);
}

function reviewDirectory(): string {
  return process.env.MENTARY_REVIEW_DIRECTORY ?? resolve(process.cwd(), "uploads", "reviews");
}

function normalizeReviewResult(review: ReviewResult): ReviewResult {
  review.questions = review.questions.map((question) => {
    delete (question as ReviewQuestion & { answer?: unknown }).answer;
    question.responseType = "multiple_choice";
    const missingComponents = new Set(question.missingComponents ?? []);
    if (question.prompt?.trim()) missingComponents.delete("prompt");
    else missingComponents.add("prompt");
    if ((question.alternatives?.length ?? 0) >= 2) missingComponents.delete("alternatives");
    else missingComponents.add("alternatives");
    const answerKey = question.answerKey?.trim().toLocaleUpperCase("pt-BR");
    if (answerKey && question.alternatives?.some((alternative) => alternative.label.trim().toLocaleUpperCase("pt-BR") === answerKey)) {
      missingComponents.delete("answer");
    } else {
      missingComponents.add("answer");
    }
    question.missingComponents = [...missingComponents];
    return question;
  });
  return review;
}

/** Saves each processed document and its question candidates as a retrievable review record. */
async function saveReviewResult(
  origin: DocumentOrigin,
  extraction: ExtractionResult,
  parsedQuestions: ParsedQuestion[],
  identification?: IdentificationDiagnostics,
): Promise<ReviewResult> {
  if (!extraction.text.trim()) {
    throw new DocumentProcessingError("Não foi possível reconhecer texto no documento. Verifique a qualidade do arquivo e tente novamente.");
  }

  const questions: ReviewQuestion[] = parsedQuestions.map((question, index) => {
    const visualReferences = findQuestionVisualReferences(question, extraction.visualPages);
    return {
      ...question,
      id: `${origin.id}-q${index + 1}`,
      status: "pending_review",
      ...(visualReferences?.length ? { visualReferences } : {}),
    };
  });
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
    ...(identification ? { identification } : {}),
    questions,
  };

  if (isDatabaseConfigured()) {
    await initializeDatabase();
    await saveReviewResultToDatabase(result);
    return result;
  }

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
  if (isDatabaseConfigured()) {
    await initializeDatabase();
    const storedReview = await getReviewResultFromDatabase(documentId);
    if (storedReview) return normalizeReviewResult(storedReview);
  }
  try {
    const content = await readFile(resolve(reviewDirectory(), `${documentId}.json`), "utf8");
    const review = normalizeReviewResult(JSON.parse(content) as ReviewResult);
    if (isDatabaseConfigured()) await importLegacyReviewResult(review);
    return review;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

/** Validates and atomically persists reviewer changes for one question. */
async function updateReviewQuestion(
  documentId: string,
  questionId: string,
  update: ReviewQuestionUpdate,
): Promise<ReviewResult | undefined> {
  const review = await getReviewResult(documentId);
  if (!review) return undefined;
  const questionIndex = review.questions.findIndex((question) => question.id === questionId);
  if (questionIndex < 0) return undefined;
  if (!update || typeof update !== "object" || Array.isArray(update)) {
    throw new DocumentValidationError("Envie os campos da questão em formato válido.");
  }

  const question = { ...review.questions[questionIndex]! };
  if ("prompt" in update) {
    if (typeof update.prompt !== "string" || !update.prompt.trim()) throw new DocumentValidationError("O enunciado não pode ficar vazio.");
    question.prompt = update.prompt.trim();
  }
  if ("answerKey" in update) {
    if (update.answerKey !== null && typeof update.answerKey !== "string") throw new DocumentValidationError("O gabarito deve ser um texto ou nulo.");
    question.answerKey = typeof update.answerKey === "string" ? update.answerKey.trim() || null : null;
  }
  question.responseType = "multiple_choice";
  if ("alternatives" in update) {
    if (!Array.isArray(update.alternatives) || update.alternatives.some((item) => !item || typeof item.label !== "string" || typeof item.text !== "string")) {
      throw new DocumentValidationError("As alternativas devem conter rótulo e texto.");
    }
    question.alternatives = update.alternatives.map((item) => ({ label: item.label.trim(), text: item.text.trim() }));
  }
  if ("reviewedBy" in update) {
    if (update.reviewedBy !== null && (typeof update.reviewedBy !== "string" || update.reviewedBy.trim().length > 120)) {
      throw new DocumentValidationError("O nome do revisor deve ter até 120 caracteres.");
    }
    question.reviewedBy = typeof update.reviewedBy === "string" ? update.reviewedBy.trim() || null : null;
  }
  if ("status" in update) {
    if (!["pending_review", "approved", "rejected"].includes(String(update.status))) throw new DocumentValidationError("Status de revisão inválido.");
    if (update.status === "approved") {
      if (!question.alternatives || question.alternatives.length < 2) {
        throw new DocumentValidationError("Uma questão objetiva precisa ter pelo menos duas alternativas antes de ser aprovada.");
      }
      if (!question.answerKey?.trim()) {
        throw new DocumentValidationError("Defina o gabarito antes de aprovar uma questão de múltipla escolha.");
      }
      const answerKey = question.answerKey.trim().toLocaleUpperCase("pt-BR");
      if (!question.alternatives?.some((alternative) => alternative.label.trim().toLocaleUpperCase("pt-BR") === answerKey)) {
        throw new DocumentValidationError("O gabarito deve corresponder a uma alternativa existente.");
      }
    }
    if (update.status === "approved" && !question.reviewedBy?.trim()) {
      throw new DocumentValidationError("Informe o responsável pela revisão antes de aprovar a questão.");
    }
    question.status = update.status!;
  }
  if ("pedagogy" in update) {
    if (!update.pedagogy || typeof update.pedagogy !== "object" || Array.isArray(update.pedagogy)) {
      throw new DocumentValidationError("As informações pedagógicas devem ser um objeto válido.");
    }
    const changes = update.pedagogy as Record<string, unknown>;
    const pedagogy: PedagogyMetadata = { ...question.pedagogy };
    for (const field of ["discipline", "grade", "topic", "descriptor"] as const) {
      if (field in changes) {
        const value = changes[field];
        if (typeof value !== "string" || value.length > 250) throw new DocumentValidationError(`O campo pedagógico ${field} deve ter até 250 caracteres.`);
        pedagogy[field] = value.trim() || undefined;
      }
    for (const field of ["userId", "institutionId"] as const) {
      if (field in changes) {
        const value = changes[field];
        if (typeof value !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(value.trim())) {
          throw new DocumentValidationError(`O campo pedagógico ${field} deve ser um UUID válido.`);
        }
        pedagogy[field] = value.trim();
      }
    }
    }
    if ("bnccSkills" in changes) {
      const value = changes.bnccSkills;
      if (!Array.isArray(value) || value.length > 20 || value.some((skill) => typeof skill !== "string" || skill.length > 100)) {
        throw new DocumentValidationError("Informe até 20 habilidades BNCC, com no máximo 100 caracteres cada.");
      }
      pedagogy.bnccSkills = value.map((skill) => skill.trim()).filter(Boolean);
    }
    if ("difficulty" in changes) {
      if (!["easy", "medium", "hard", "unknown"].includes(String(changes.difficulty))) throw new DocumentValidationError("Nível de dificuldade inválido.");
      pedagogy.difficulty = changes.difficulty as PedagogyMetadata["difficulty"];
    }
    question.pedagogy = pedagogy;
  }

  const missingComponents = new Set(question.missingComponents ?? []);
  if (question.prompt?.trim()) missingComponents.delete("prompt");
  else missingComponents.add("prompt");
  if ((question.alternatives?.length ?? 0) < 2) missingComponents.add("alternatives");
  else missingComponents.delete("alternatives");
  const normalizedAnswerKey = question.answerKey?.trim().toLocaleUpperCase("pt-BR");
  const hasValidAnswerKey = Boolean(normalizedAnswerKey
    && question.alternatives?.some((alternative) => alternative.label.trim().toLocaleUpperCase("pt-BR") === normalizedAnswerKey));
  if (hasValidAnswerKey) missingComponents.delete("answer");
  else missingComponents.add("answer");
  question.missingComponents = [...missingComponents];

  review.questions[questionIndex] = question;
  if (isDatabaseConfigured()) {
    await saveReviewResultToDatabase(review);
  } else {
    const filePath = resolve(reviewDirectory(), `${documentId}.json`);
    const temporaryPath = `${filePath}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(review, null, 2)}\n`, "utf8");
    await rename(temporaryPath, filePath);
  }
  return review;
}

async function migrateLegacyReviewFiles(): Promise<number> {
  if (!isDatabaseConfigured()) return 0;
  await initializeDatabase();
  let fileNames: string[];
  try {
    fileNames = await readdir(reviewDirectory());
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return 0;
    throw error;
  }
  let importedCount = 0;
  for (const fileName of fileNames.filter((name) => /^[\da-f-]{36}\.json$/i.test(name))) {
    const content = await readFile(resolve(reviewDirectory(), fileName), "utf8");
    const review = normalizeReviewResult(JSON.parse(content) as ReviewResult);
    if (await importLegacyReviewResult(review)) importedCount += 1;
  }
  return importedCount;
}

async function removeReviewResult(documentId: string): Promise<void> {
  if (isDatabaseConfigured()) {
    await deleteReviewResultFromDatabase(documentId);
  }
  await rm(resolve(reviewDirectory(), `${documentId}.json`), { force: true });
}

export { findQuestionVisualReferences, getReviewResult, migrateLegacyReviewFiles, removeReviewResult, saveReviewResult, updateReviewQuestion };
export type { ReviewQuestion, ReviewQuestionUpdate, ReviewResult };
