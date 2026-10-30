type QuestionDraft = {
  number: number | null;
  text: string;
  pageStart: number;
  pageEnd: number;
  explicitLabel: boolean;
  numberedLabel?: boolean;
};

type ParsedQuestion = {
  number: number | null;
  text: string;
  prompt?: string;
  answer?: string | null;
  answerKey?: string | null;
  responseType?: "open" | "multiple_choice" | "mixed" | "unknown";
  alternatives?: Array<{ label: string; text: string }>;
  missingComponents?: Array<"prompt" | "alternatives" | "answer">;
  pageStart: number;
  pageEnd: number;
  confidence: "high" | "medium";
};

const questionIntent = /\?|\b(assinale|marque|indique|explique|calcule|resolva|resolve|complete|identifique|responda|observe|leia|considere|analise|determine|escreva|cite|compare|descreva|classifique|escolha|implemente|implementar|desenvolva|construa|crie|projete|elabore|desenhe|faca|faça|qual|quais|quem|onde|quando|como|por que|o que|quanto|quantos|então|soma|seria de)\b/i;
const directQuestionStart = /^(qual|quais|quem|onde|quando|como|por que|o que|quanto|quantos)\b/i;

function createQuestionDraft(
  number: number | null,
  text: string,
  page: number,
  explicitLabel: boolean,
  numberedLabel?: boolean,
): QuestionDraft {
  return { number, text, pageStart: page, pageEnd: page, explicitLabel, numberedLabel };
}

function appendQuestionLine(draft: QuestionDraft, line: string, page: number): void {
  const text = line.trim();
  if (!text) return;
  draft.text += `\n${text}`;
  draft.pageEnd = page;
}

function normalizeQuestionText(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function finalizeQuestionDraft(draft: QuestionDraft): ParsedQuestion | undefined {
  const text = normalizeQuestionText(draft.text);
  const isReadable = text.length >= 3 && /[\p{L}\p{N}]/u.test(text);
  const isIdentified = draft.explicitLabel || draft.numberedLabel
    || (draft.number === null ? directQuestionStart.test(text) : questionIntent.test(text));
  if (!(isReadable || draft.explicitLabel || draft.numberedLabel) || !isIdentified) return undefined;

  return {
    number: draft.number,
    text,
    pageStart: draft.pageStart,
    pageEnd: draft.pageEnd,
    confidence: draft.explicitLabel ? "high" : "medium",
  };
}

function mergeQuestionFragments(questions: ParsedQuestion[]): ParsedQuestion[] {
  const mergedQuestions: ParsedQuestion[] = [];
  for (const question of questions) {
    const previous = mergedQuestions.at(-1);
    const isSameQuestionFragment = previous
      && question.number !== null
      && previous.number === question.number
      && previous.pageStart === question.pageStart;

    if (isSameQuestionFragment && previous) {
      previous.text = normalizeQuestionText(`${previous.text}\n${question.text}`);
      previous.pageEnd = Math.max(previous.pageEnd, question.pageEnd);
      if (previous.confidence === "medium" && question.confidence === "high") {
        previous.confidence = "high";
      }
      continue;
    }

    mergedQuestions.push({ ...question });
  }
  return mergedQuestions;
}

export { appendQuestionLine, createQuestionDraft, finalizeQuestionDraft, mergeQuestionFragments };
export type { ParsedQuestion, QuestionDraft };
