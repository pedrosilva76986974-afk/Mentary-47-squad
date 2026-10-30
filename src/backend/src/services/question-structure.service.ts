import type { ParsedQuestion } from "./question-parser.service.js";
import { containsCode, separateQuestionAnswer } from "./question-content.service.js";
import { extractQuestionAlternatives } from "./question-alternatives.service.js";

function structureQuestion(question: ParsedQuestion, sourceQuestion: ParsedQuestion = question): ParsedQuestion {
  const sourceText = sourceQuestion.text;
  const sourceHasCode = containsCode(sourceText);
  const sourceSeparated = separateQuestionAnswer(sourceText);
  const modelSeparated = separateQuestionAnswer(question.text);
  const answer = sourceSeparated.answer ?? modelSeparated.answer ?? question.answer;
  const prompt = sourceHasCode || sourceSeparated.answer
    ? sourceSeparated.prompt
    : question.prompt !== undefined ? question.prompt.trim() : sourceSeparated.prompt;
  const content = { ...question, text: sourceHasCode ? sourceText : question.text, prompt, answer };
  let optionSource = sourceHasCode || sourceSeparated.answer ? sourceSeparated.prompt : modelSeparated.prompt;
  if (answer) {
    const answerStart = optionSource.lastIndexOf(answer);
    if (answerStart > 0) optionSource = optionSource.slice(0, answerStart).trimEnd();
  }
  const { prompt: promptWithoutAlternatives, alternatives } = extractQuestionAlternatives(
    optionSource,
    content.prompt,
    question.alternatives,
  );
  const isSubquestionList = isExerciseList(alternatives);
  const isOpenExercise = /\b(?:resolva|resolver|calcule|calcular)\s+(?:as|os|cada|a|o)?\s*(?:equações?|questões?|itens?)\b|\bdetermine\s+(?:o valor|a raiz)\b.*\bequação\b/i.test(content.prompt)
    && !/\b(assinale|marque|alternativa|opção|opcao)\b/i.test(content.prompt);
  const requestsWrittenJustification = /\b(justifique|explique|descreva|demonstre|fundamente|argumente|comente|desenvolva|apresente)\b/i.test(content.prompt);
  const isMixedExercise = question.responseType === "mixed"
    || (alternatives.length > 0 && !isSubquestionList && requestsWrittenJustification);
  const responseType = isSubquestionList
    ? "open"
    : isMixedExercise
      ? "mixed"
      : isOpenExercise
        ? "open"
        : alternatives.length > 0
          ? "multiple_choice"
          : question.responseType ?? "open";
  const result: ParsedQuestion = {
    ...content,
    prompt: promptWithoutAlternatives || content.prompt,
    responseType,
    alternatives,
  };
  result.missingComponents = [
    ...(!result.prompt?.trim() ? ["prompt" as const] : []),
    ...(result.responseType !== "open" && alternatives.length === 0 ? ["alternatives" as const] : []),
    ...(!result.answer?.trim() ? ["answer" as const] : []),
  ];
  return result;
}

function isExerciseList(alternatives: Array<{ label: string }>): boolean {
  return alternatives.length >= 7
    && alternatives.every((alternative, index) => alternative.label === String.fromCharCode(65 + index));
}

export { isExerciseList, structureQuestion };
