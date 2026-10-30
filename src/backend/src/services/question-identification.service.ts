import { classifyQuestionsWithOllamaDetailed, type OllamaMetrics, type QuestionClassification } from "./ollama.service.js";
import { applyPrintedAnswerKey } from "./answer-key.service.js";
import { parseQuestions, type ParsedQuestion } from "./question-parser.service.js";
import { isExerciseList, structureQuestion } from "./question-structure.service.js";

type IdentificationDiagnostics = {
  method: "ollama" | "ollama+rules" | "rules";
  model?: string;
  reason?: string;
  durationMs: number;
  localParserMs: number;
  extractionDurationMs?: number;
  ollama?: OllamaMetrics;
};

type IdentificationResult = { questions: ParsedQuestion[]; diagnostics: IdentificationDiagnostics };

function runLocalParser(pageTexts: string[]): { questions: ParsedQuestion[]; durationMs: number } {
  const startedAt = Date.now();
  const questions = parseQuestions(pageTexts).map((question) => structureQuestion(question));
  return { questions, durationMs: Date.now() - startedAt };
}

function isCompatibleClassification(question: ParsedQuestion, responseType: QuestionClassification["responseType"]): boolean {
  const alternatives = question.alternatives ?? [];
  if (responseType === "multiple_choice" || responseType === "mixed") return alternatives.length >= 2;
  if (responseType === "open") return alternatives.length === 0 || isExerciseList(alternatives);
  return false;
}

function applyClassifications(
  questions: ParsedQuestion[],
  classifications: QuestionClassification[],
): { questions: ParsedQuestion[]; appliedCount: number } {
  const byIndex = new Map(classifications.map((classification) => [classification.questionIndex, classification]));
  let appliedCount = 0;
  const classifiedQuestions = questions.map((question, index) => {
    const classification = byIndex.get(index);
    if (!classification || classification.confidence !== "high"
      || !isCompatibleClassification(question, classification.responseType)) return question;
    appliedCount += 1;
    // The model may classify only. OCR text, prompt, answer and alternatives stay byte-for-byte from local code.
    return { ...question, responseType: classification.responseType };
  });
  return { questions: classifiedQuestions, appliedCount };
}

async function identifyQuestionsDetailed(pageTexts: string[]): Promise<IdentificationResult> {
  const startedAt = Date.now();
  const local = runLocalParser(pageTexts);
  const localQuestions = applyPrintedAnswerKey(local.questions, pageTexts);
  if (process.env.QUESTION_IDENTIFIER !== "ollama") {
    return {
      questions: localQuestions,
      diagnostics: {
        method: "rules",
        reason: "Ollama não foi ativado nesta execução (QUESTION_IDENTIFIER diferente de ollama).",
        durationMs: Date.now() - startedAt,
        localParserMs: local.durationMs,
      },
    };
  }

  try {
    const result = await classifyQuestionsWithOllamaDetailed(localQuestions);
    const applied = applyClassifications(localQuestions, result.classifications);
    const omittedCount = localQuestions.length - result.classifications.length;
    const unappliedCount = result.classifications.length - applied.appliedCount;
    const reasons = [
      ...(omittedCount > 0 ? [`Ollama não classificou ${omittedCount} questão(ões); as regras locais foram mantidas.`] : []),
      ...(unappliedCount > 0 ? [`A classificação de ${unappliedCount} questão(ões) foi ignorada por baixa confiança ou incompatibilidade com as alternativas identificadas.`] : []),
    ];
    return {
      questions: applied.questions,
      diagnostics: {
        method: reasons.length > 0 ? "ollama+rules" : "ollama",
        model: process.env.OLLAMA_MODEL,
        ...(reasons.length > 0 ? { reason: reasons.join(" ") } : {}),
        durationMs: Date.now() - startedAt,
        localParserMs: local.durationMs,
        ollama: result.metrics,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      const configuredTimeout = Number(process.env.OLLAMA_TIMEOUT_MS);
      const timeoutMs = Number.isInteger(configuredTimeout) && configuredTimeout > 0 ? configuredTimeout : 90_000;
      console.warn(`Ollama excedeu o tempo limite de ${timeoutMs} ms; mantendo a classificação local por regras.`);
    } else {
      console.error("Falha na classificação pelo Ollama; mantendo a classificação local por regras.", error);
    }
    return {
      questions: localQuestions,
      diagnostics: {
        method: "rules",
        model: process.env.OLLAMA_MODEL,
        reason: error instanceof Error ? error.message : "Falha inesperada na classificação pelo Ollama.",
        durationMs: Date.now() - startedAt,
        localParserMs: local.durationMs,
      },
    };
  }
}

async function identifyQuestions(pageTexts: string[]): Promise<ParsedQuestion[]> {
  return (await identifyQuestionsDetailed(pageTexts)).questions;
}

export { identifyQuestions, identifyQuestionsDetailed };
export type { IdentificationDiagnostics, IdentificationResult };
