import { QuestionParsingSession } from "./question-parser-session.service.js";
import type { ParsedQuestion } from "./question-assembly.service.js";

function getPageLines(pageText: string): string[] {
  const separatedExplicitLabels = pageText.replace(
    /(?<!class)\s+(?=Quest(?:ão|ao)\s*(?:n[º°o.]?\s*)?\d{1,3}(?:\s*[:.)-]|\s+))/gi,
    "\n",
  );
  const lines = separatedExplicitLabels.split(/\r?\n/);
  const label = (line: string): string | undefined => {
    const match = line.match(/^\s*(?:([A-Ja-j])|([1-9])|([€¢])|([1-9])([A-Ja-j]))\s*[).:-]\s*\S/);
    if (!match) return undefined;
    if (match[5]) return match[5].toUpperCase();
    if (match[1]) return match[1].toUpperCase();
    if (match[3]) return "C";
    return match[2];
  };

  return lines.map((line, index) => {
    const current = line.match(/^(\s*)([14])([).:-]\s*\S.*)$/);
    if (current && label(lines[index + 1] ?? "") === "B") {
      return `${current[1]}A${current[3]}`;
    }
    if (current && label(lines[index - 1] ?? "") === "C") {
      return `${current[1]}D${current[3]}`;
    }
    return line
      .replace(/^(\s*)[€¢]([).:-]\s*\S.*)$/u, "$1C$2")
      .replace(/^(\s*)4([dD])([).:-]\s*\S.*)$/u, "$1D$3");
  });
}

/** Parses page text and preserves question state across page boundaries. */
function parseQuestions(pageTexts: string[]): ParsedQuestion[] {
  const session = new QuestionParsingSession();
  pageTexts.forEach((pageText, pageIndex) => {
    for (const line of getPageLines(pageText)) session.addLine(line, pageIndex + 1);
  });
  return session.finish();
}

export { parseQuestions };
export type { ParsedQuestion };
