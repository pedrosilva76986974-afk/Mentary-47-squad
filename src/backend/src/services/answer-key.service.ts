import type { ParsedQuestion } from "./question-parser.service.js";

const answerKeyHeader = /\b(?:gabarito|respostas? corretas|chave de respostas)\b/i;
const answerKeyEntry = /(?:quest(?:ão|ao)\s*)?(\d{1,3})\s*(?:[-.):=]\s*|\s+)?([A-J])(?=\b|(?=\d)|$)/gi;

function applyPrintedAnswerKey(questions: ParsedQuestion[], pageTexts: string[]): ParsedQuestion[] {
  const answerKey = new Map<number, string>();
  let readingKey = false;
  let pendingQuestionNumbers: number[] | undefined;
  for (const line of pageTexts.join("\n").split(/\r?\n/)) {
    const hasHeader = answerKeyHeader.test(line);
    if (hasHeader) readingKey = true;
    if (!readingKey) continue;

    const content = line.replace(answerKeyHeader, "").replace(/^\s*[:\-–]\s*/, "");
    const matches = [...content.matchAll(answerKeyEntry)];
    const remaining = content.replace(answerKeyEntry, "").replace(/[\s,;|()[\]{}]+/g, "");
    if (matches.length > 0 && remaining.length === 0) {
      for (const match of matches) answerKey.set(Number(match[1]), match[2]!.toUpperCase());
      pendingQuestionNumbers = undefined;
      continue;
    }

    const tokens = content.trim().split(/[\s,;|()[\]{}]+/).filter(Boolean);
    if (tokens.length >= 2 && tokens.every((token) => /^\d{1,3}$/.test(token))) {
      pendingQuestionNumbers = tokens.map(Number);
      continue;
    }
    if (pendingQuestionNumbers && tokens.length === pendingQuestionNumbers.length
      && tokens.every((token) => /^[A-J]$/i.test(token))) {
      pendingQuestionNumbers.forEach((number, index) => answerKey.set(number, tokens[index]!.toUpperCase()));
      pendingQuestionNumbers = undefined;
      continue;
    }
    if (content.trim()) pendingQuestionNumbers = undefined;
  }
  return questions.map((question) => {
    if (question.number === null || question.answerKey?.trim()) return question;
    const label = answerKey.get(question.number);
    if (!label || !question.alternatives?.some((alternative) => alternative.label.toUpperCase() === label)) return question;
    return { ...question, answerKey: label, missingComponents: question.missingComponents?.filter((component) => component !== "answer") };
  });
}

export { applyPrintedAnswerKey };
