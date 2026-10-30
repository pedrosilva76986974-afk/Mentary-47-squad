type SeparatedAnswer = { prompt: string; answer: string | null };

const explicitAnswer = /^\s*(?:gabarito|resposta(?:\s+correta)?|solu[cç][aã]o|resolu[cç][aã]o|answer|explanation|explica[cç][aã]o)\s*[:\-]\s*/i;
const answerLanguage = /\b(complexidade|big\s*[- ]?o|gabarito|resposta correta|portanto|logo|resultando|pior caso|número de chamadas|profundidade|iterações|tempo (?:de execução|é)|executa n\s*\/|o algoritmo possui|o código possui|a função recursiva|o laço .* (?:roda|itera|executa))\b/i;
const codeStart = /^\s*(?:(?:public|private|protected)\s+)?(?:class\s+\w+|(?:public\s+)?static\s+\w[\w<>\[\]]*\s+\w+\s*\(|(?:for|while|if)\s*\(|def\s+\w+\s*\()/;

function separateQuestionAnswer(text: string): SeparatedAnswer {
  const lines = text.split(/\r?\n/);
  const explicitIndex = lines.findIndex((line) => explicitAnswer.test(line));
  if (explicitIndex >= 0) {
    const answerLines = [...lines.slice(explicitIndex)];
    const firstAnswer = answerLines[0] ?? "";
    answerLines[0] = firstAnswer.replace(explicitAnswer, "");
    const answer = answerLines.join("\n").trim();
    return { prompt: lines.slice(0, explicitIndex).join("\n").trim() || text.trim(), answer: answer || null };
  }

  let codeStarted = false;
  let braceDepth = 0;
  let codeEndIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!codeStarted && codeStart.test(line)) codeStarted = true;
    if (!codeStarted) continue;
    braceDepth += (line.match(/{/g) ?? []).length - (line.match(/}/g) ?? []).length;
    if (braceDepth === 0 && (line.includes("}") || !line.trim())) {
      codeEndIndex = index;
      break;
    }
  }

  if (codeEndIndex >= 0) {
    const following = lines.slice(codeEndIndex + 1);
    const firstExplanation = following.findIndex((line) => line.trim().length > 0);
    if (firstExplanation >= 0) {
      const explanation = following.slice(firstExplanation).join("\n").trim();
      if (answerLanguage.test(explanation)) {
        return {
          prompt: lines.slice(0, codeEndIndex + 1).join("\n").trim(),
          answer: explanation,
        };
      }
    }
  }

  return { prompt: text.trim(), answer: null };
}

function containsCode(text: string): boolean {
  return text.split(/\r?\n/).some((line) => codeStart.test(line));
}

export { containsCode, separateQuestionAnswer };
export type { SeparatedAnswer };
