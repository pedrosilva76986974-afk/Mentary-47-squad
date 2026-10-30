type ClassifiedQuestionLine =
  | { kind: "explicit-label"; number: number; text: string }
  | { kind: "standalone-number"; number: number }
  | { kind: "numbered-prompt"; number: number; text: string; startsWithWords: boolean }
  | { kind: "direct-prompt"; text: string }
  | { kind: "other" };

const explicitQuestion = /^\s*Quest(?:ão|ao)\s*(?:n[º°o.]?\s*)?(\d{1,3})(?:\s*[:.)-]\s*|\s+|$)(.*)$/i;
const standaloneNumber = /^\s*\(?(\d{1,3})\)?\s*[.)-]\s*$/;
// OCR may put one stray symbol/letter before a number; anchoring to line start
// prevents reading numbers inside formulas as question labels.
const numberedQuestion = /^\s*(?:[^\p{N}\s]{1,2}\s*)?\(?(\d{1,3})\)?\s*[.),-]\s+(.+)$/u;

function classifyQuestionLine(line: string): ClassifiedQuestionLine {
  const isCodeClassDeclaration = /^\s*(?:(?:public|private|protected)\s+)?class\s+\w+/i.test(line);
  const explicitMatch = isCodeClassDeclaration ? null : line.match(explicitQuestion);
  if (explicitMatch) {
    return { kind: "explicit-label", number: Number(explicitMatch[1]), text: explicitMatch[2] ?? "" };
  }

  const standaloneMatch = line.match(standaloneNumber);
  if (standaloneMatch) return { kind: "standalone-number", number: Number(standaloneMatch[1]) };

  const numberedMatch = line.match(numberedQuestion);
  if (numberedMatch) {
    const text = numberedMatch[2] ?? "";
    return {
      kind: "numbered-prompt",
      number: Number(numberedMatch[1]),
      text,
      startsWithWords: /^[^\p{L}]*[\p{L}](?:[\p{L}]|\s+[\p{L}]{2,})/u.test(text),
    };
  }

  const trimmedLine = line.trim();
  if (trimmedLine.length >= 8 && trimmedLine.includes("?")) {
    return { kind: "direct-prompt", text: trimmedLine };
  }
  return { kind: "other" };
}

export { classifyQuestionLine };
export type { ClassifiedQuestionLine };
