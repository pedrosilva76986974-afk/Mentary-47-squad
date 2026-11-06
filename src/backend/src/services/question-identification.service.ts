import { applyPrintedAnswerKey } from "./answer-key.service.js";
import { parseQuestions, type ParsedQuestion } from "./question-parser.service.js";
import { isObjectiveQuestion, structureQuestion } from "./question-structure.service.js";
type IdentificationDiagnostics = { method: "rules" | "ollama" | "ollama+rules"; reason?: string; model?: string; durationMs: number; localParserMs: number; extractionDurationMs?: number };
async function identifyQuestionsDetailed(pageTexts: string[]) {
  const start = Date.now();
  const questions = applyPrintedAnswerKey(parseQuestions(pageTexts).map(q => structureQuestion(q)).filter(isObjectiveQuestion), pageTexts);
  return { questions, diagnostics: { method: "rules" as const, reason: "Extração local; análise pedagógica disponível após o envio.", durationMs: Date.now() - start, localParserMs: Date.now() - start } };
}
async function identifyQuestions(pageTexts: string[]): Promise<ParsedQuestion[]> { return (await identifyQuestionsDetailed(pageTexts)).questions; }
export { identifyQuestionsDetailed, identifyQuestions };
export type { IdentificationDiagnostics };
