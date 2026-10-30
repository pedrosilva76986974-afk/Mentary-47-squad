import { classifyQuestionLine } from "./question-line-classifier.service.js";
import {
  appendQuestionLine,
  createQuestionDraft,
  finalizeQuestionDraft,
  mergeQuestionFragments,
  type ParsedQuestion,
  type QuestionDraft,
} from "./question-assembly.service.js";

const questionIntent = /\?|\b(assinale|marque|indique|explique|calcule|resolva|resolve|complete|identifique|responda|observe|leia|considere|analise|determine|escreva|cite|compare|descreva|classifique|escolha|implemente|implementar|desenvolva|construa|crie|projete|elabore|desenhe|faca|faça|qual|quais|quem|onde|quando|como|por que|o que|quanto|quantos|então|soma|seria de)\b/i;
const directQuestionStart = /^(qual|quais|quem|onde|quando|como|por que|o que|quanto|quantos)\b/i;
const supplementaryListHeader = /^\s*(observa(?:ções|coes)|instru(?:ções|coes)|orienta(?:ções|coes)|recomenda(?:ções|coes)|notas)\s*:?$/i;

function normalizeSequentialNumber(candidate: number, previous: number | null | undefined): number {
  if (previous !== null && previous !== undefined && candidate >= 100 && candidate % 100 === previous + 1) {
    return candidate % 100;
  }
  return candidate;
}

class QuestionParsingSession {
  private readonly questions: ParsedQuestion[] = [];
  private active: QuestionDraft | undefined;
  private insideSupplementaryList = false;
  private insideAdministrativeInstructions = false;

  addLine(line: string, page: number): void {
    if (/\bleia\s+atentamente\s+as\s+instru(?:ções|coes)\b/i.test(line)) {
      this.finishActive();
      this.insideAdministrativeInstructions = true;
      this.insideSupplementaryList = false;
      return;
    }

    const classifiedLine = classifyQuestionLine(line);
    if (classifiedLine.kind === "explicit-label") {
      this.finishActive();
      this.insideAdministrativeInstructions = false;
      this.insideSupplementaryList = false;
      this.active = createQuestionDraft(classifiedLine.number, classifiedLine.text, page, true);
      return;
    }

    if (this.insideAdministrativeInstructions) return;

    if (supplementaryListHeader.test(line)) {
      this.insideSupplementaryList = true;
      if (this.active) appendQuestionLine(this.active, line, page);
      return;
    }

    if (this.insideSupplementaryList) {
      if (this.active) appendQuestionLine(this.active, line, page);
      return;
    }

    if (classifiedLine.kind === "standalone-number") {
      const previousNumber = this.active?.number ?? this.questions.at(-1)?.number;
      const candidateNumber = normalizeSequentialNumber(classifiedLine.number, previousNumber);
      // Ignore a numbered code/prose fragment unless it advances the question sequence.
      if (previousNumber !== null && previousNumber !== undefined && candidateNumber !== previousNumber + 1) {
        if (this.active) appendQuestionLine(this.active, line, page);
        return;
      }
      this.finishActive();
      const numberedLabel = previousNumber !== null && previousNumber !== undefined && candidateNumber === previousNumber + 1
        && (Boolean(this.active && (this.active.explicitLabel || this.active.numberedLabel || questionIntent.test(this.active.text)))
          || this.questions.at(-1)?.number === previousNumber);
      this.active = createQuestionDraft(candidateNumber, "", page, false, numberedLabel);
      return;
    }

    if (classifiedLine.kind === "numbered-prompt") {
      // A label must be followed by a word, not an equation fragment such as "2) 22x...".
      if (!classifiedLine.startsWithWords) {
        if (this.active) appendQuestionLine(this.active, line, page);
        return;
      }
      const previousNumber = this.active?.number ?? this.questions.at(-1)?.number;
      const candidateNumber = normalizeSequentialNumber(classifiedLine.number, previousNumber);
      if (previousNumber !== null && previousNumber !== undefined && candidateNumber !== previousNumber + 1) {
        if (this.active) appendQuestionLine(this.active, line, page);
        return;
      }
      this.finishActive();
      const numberedLabel = previousNumber !== null && previousNumber !== undefined && candidateNumber === previousNumber + 1
        && (Boolean(this.active && (this.active.explicitLabel || this.active.numberedLabel || questionIntent.test(this.active.text)))
          || this.questions.at(-1)?.number === previousNumber);
      this.active = createQuestionDraft(candidateNumber, classifiedLine.text, page, false, numberedLabel);
      return;
    }

    if (
      classifiedLine.kind === "direct-prompt"
      && (!this.active || (this.active.number === null && this.active.text.includes("?") && directQuestionStart.test(classifiedLine.text)))
    ) {
      this.finishActive();
      this.active = createQuestionDraft(null, classifiedLine.text, page, false);
      return;
    }

    if (this.active) appendQuestionLine(this.active, line, page);
  }

  finish(): ParsedQuestion[] {
    this.finishActive();
    return mergeQuestionFragments(this.questions);
  }

  private finishActive(): void {
    if (!this.active) return;
    const question = finalizeQuestionDraft(this.active);
    if (question) this.questions.push(question);
    this.active = undefined;
  }
}

export { QuestionParsingSession };
