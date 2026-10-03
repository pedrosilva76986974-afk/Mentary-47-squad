type QuestionDraft = {
  number: number | null;
  text: string;
  pageStart: number;
  pageEnd: number;
  explicitLabel: boolean;
};

type ParsedQuestion = {
  number: number | null;
  text: string;
  pageStart: number;
  pageEnd: number;
  confidence: "high" | "medium";
};

const explicitQuestion = /^\s*Quest(?:ão|ao)\s*(?:n[º°o.]?\s*)?(\d{1,3})(?:\s*[:.)-]\s*|\s+|$)(.*)$/i;
const standaloneNumber = /^\s*\(?(\d{1,3})\)?\s*[.)-]\s*$/;
const numberedQuestion = /^\s*\(?(\d{1,3})\)?\s*[.)-]\s+(.+)$/;
const questionIntent = /\?|\b(assinale|marque|indique|explique|calcule|resolva|complete|identifique|responda|observe|leia|considere|analise|determine|escreva|cite|compare|descreva|classifique|escolha|implemente|implementar|desenvolva|construa|crie|projete|elabore|desenhe|faca|faça|qual|quais|quem|onde|quando|como|por que|o que|quanto|quantos)\b/i;
const directQuestionStart = /^(qual|quais|quem|onde|quando|como|por que|o que|quanto|quantos)\b/i;
const supplementaryListHeader = /^\s*(observa(?:ções|coes)|instru(?:ções|coes)|orienta(?:ções|coes)|recomenda(?:ções|coes)|notas)\s*:?\s*$/i;

function normalizeQuestionText(text: string): string {
  return text
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Separates labeled or clearly interrogative numbered prompts while preserving page provenance. */
function parseQuestions(pageTexts: string[]): ParsedQuestion[] {
  const questions: ParsedQuestion[] = [];
  let active: QuestionDraft | undefined;
  let insideSupplementaryList = false;

  const finishActive = (): void => {
    if (!active) return;
    const text = normalizeQuestionText(active.text);
    const isReadable = text.length >= 3 && /[\p{L}\p{N}]/u.test(text);
    if (isReadable && (active.explicitLabel || questionIntent.test(text))) {
      questions.push({
        number: active.number,
        text,
        pageStart: active.pageStart,
        pageEnd: active.pageEnd,
        confidence: active.explicitLabel ? "high" : "medium",
      });
    }
    active = undefined;
  };

  pageTexts.forEach((pageText, pageIndex) => {
    const separatedExplicitLabels = pageText.replace(
      /\s+(?=Quest(?:ão|ao)\s*(?:n[º°o.]?\s*)?\d{1,3}(?:\s*[:.)-]|\s+))/gi,
      "\n",
    );
    const lines = separatedExplicitLabels.split(/\r?\n/);

    for (const line of lines) {
      const explicitMatch = line.match(explicitQuestion);
      if (explicitMatch) {
        finishActive();
        insideSupplementaryList = false;
        active = {
          number: Number(explicitMatch[1]),
          text: explicitMatch[2] ?? "",
          pageStart: pageIndex + 1,
          pageEnd: pageIndex + 1,
          explicitLabel: true,
        };
        continue;
      }

      if (supplementaryListHeader.test(line)) {
        insideSupplementaryList = true;
        if (active && line.trim()) {
          active.text += `\n${line.trim()}`;
          active.pageEnd = pageIndex + 1;
        }
        continue;
      }

      if (insideSupplementaryList) {
        if (active && line.trim()) {
          active.text += `\n${line.trim()}`;
          active.pageEnd = pageIndex + 1;
        }
        continue;
      }

      const standaloneMatch = line.match(standaloneNumber);
      if (standaloneMatch) {
        const candidateNumber = Number(standaloneMatch[1]);
        const previousNumber = active?.number ?? questions.at(-1)?.number;
        // A numbered line inside code or prose is a question only when it
        // continues the document's numbering sequence.
        if (previousNumber !== null && previousNumber !== undefined && candidateNumber !== previousNumber + 1) {
          if (active) {
            active.text += `\n${line.trim()}`;
            active.pageEnd = pageIndex + 1;
          }
          continue;
        }
        finishActive();
        active = {
          number: candidateNumber,
          text: "",
          pageStart: pageIndex + 1,
          pageEnd: pageIndex + 1,
          explicitLabel: false,
        };
        continue;
      }

      const numberedMatch = line.match(numberedQuestion);
      if (numberedMatch && questionIntent.test(numberedMatch[2] ?? "")) {
        const candidateNumber = Number(numberedMatch[1]);
        const previousNumber = active?.number ?? questions.at(-1)?.number;
        if (previousNumber !== null && previousNumber !== undefined && candidateNumber !== previousNumber + 1) {
          if (active) {
            active.text += `\n${line.trim()}`;
            active.pageEnd = pageIndex + 1;
          }
          continue;
        }
        finishActive();
        active = {
          number: candidateNumber,
          text: numberedMatch[2] ?? "",
          pageStart: pageIndex + 1,
          pageEnd: pageIndex + 1,
          explicitLabel: false,
        };
        continue;
      }

      const trimmedLine = line.trim();
      const isDirectQuestion = trimmedLine.length >= 8 && trimmedLine.includes("?");
      if (
        isDirectQuestion &&
        (!active || (active.text.includes("?") && directQuestionStart.test(trimmedLine)))
      ) {
        finishActive();
        active = {
          number: null,
          text: trimmedLine,
          pageStart: pageIndex + 1,
          pageEnd: pageIndex + 1,
          explicitLabel: false,
        };
        continue;
      }

      if (active && line.trim()) {
        active.text += `\n${line.trim()}`;
        active.pageEnd = pageIndex + 1;
      }
    }
  });

  finishActive();

  // PDFs can repeat the same question label when a prompt and its code/body
  // are laid out as separate text blocks. Keep adjacent fragments together.
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

export { parseQuestions };
export type { ParsedQuestion };
