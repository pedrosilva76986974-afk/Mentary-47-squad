import type { ParsedQuestion } from "./question-parser.service.js";
import { extractQuestionAlternatives, hasAlternativeLabelGaps } from "./question-alternatives.service.js";

function structureQuestion(question: ParsedQuestion, sourceQuestion: ParsedQuestion = question): ParsedQuestion {
  const prompt = question.prompt !== undefined ? question.prompt.trim() : sourceQuestion.text.trim();
  const content = { ...question, text: sourceQuestion.text, prompt };
  const optionSource = question.text;
  const { prompt: promptWithoutAlternatives, alternatives } = extractQuestionAlternatives(
    optionSource,
    content.prompt,
    question.alternatives,
  );
  const result: ParsedQuestion = {
    ...content,
    prompt: promptWithoutAlternatives || content.prompt,
    responseType: "multiple_choice",
    alternatives,
  };
  result.missingComponents = [
    ...(!result.prompt?.trim() ? ["prompt" as const] : []),
    ...(alternatives.length < 2 || hasAlternativeLabelGaps(alternatives) ? ["alternatives" as const] : []),
    ...(!result.answerKey?.trim() ? ["answer" as const] : []),
  ];
  return result;
}

function isObjectiveQuestion(question: ParsedQuestion): boolean {
  const prompt = question.prompt ?? question.text;
  const explicitlyObjective = /\b(?:assinale|marque|escolha|selecione|indique)\b.{0,80}\b(?:alternativa|opção|opcao|correta|incorreta)|\b(?:alternativa|opção|opcao)\s+(?:correta|incorreta)\b/i.test(prompt);
  const exerciseList = /\b(?:resolva|resolver|calcule|calcular)\s+(?:(?:as|os|cada|a|o)\s+)?(?:(?:seguintes|abaixo|propostas)\s+)?(?:equações?|questões?|itens?)\b|\bdetermine\s+(?:o valor|a raiz)\b.*\bequação\b/i.test(prompt)
    && !explicitlyObjective;
  const explicitlyDiscursive = /^\s*(?:explique|descreva|discorra|disserte|redija|escreva|justifique|demonstre|prove)\b/i.test(prompt);
  // A numbered candidate with damaged choices cannot safely be classified as
  // discursive just because OCR did not recover its alternatives.
  const incompleteCandidate = question.number !== null && !explicitlyDiscursive;
  return !exerciseList && (explicitlyObjective || (question.alternatives?.length ?? 0) >= 2 || incompleteCandidate);
}

export { isObjectiveQuestion, structureQuestion };
