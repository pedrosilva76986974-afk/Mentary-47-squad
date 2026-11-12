import type { ParsedQuestion } from "./question-parser.service.js";

type Alternative = NonNullable<ParsedQuestion["alternatives"]>[number];
type ExtractedAlternatives = { prompt?: string; alternatives: Alternative[] };
type OptionMarker = { index: number; end: number; label: string };

const answerKeySection = /(?:^|\n)[ \t]*(?:gabarito|respostas? corretas|chave de respostas)\b[\s\S]*$/i;

function findSequentialOptionRun(candidates: OptionMarker[]): OptionMarker[] {
  let bestRun: OptionMarker[] = [];
  for (let start = 0; start < candidates.length; start += 1) {
    const run = [candidates[start]!];
    let expected = candidates[start]!.label.charCodeAt(0) + 1;
    let cursor = start;
    while (expected <= "J".charCodeAt(0)) {
      let nextIndex = candidates.findIndex((candidate, index) => index > cursor && candidate.label.charCodeAt(0) === expected);
      if (nextIndex < 0) {
        nextIndex = candidates.findIndex((candidate, index) => index > cursor && candidate.label.charCodeAt(0) === expected + 1);
      }
      if (nextIndex < 0) break;
      const candidate = candidates[nextIndex]!;
      run.push(candidate);
      expected = candidate.label.charCodeAt(0) + 1;
      cursor = nextIndex;
    }
    if (run.length >= bestRun.length) bestRun = run;
  }
  return bestRun.length >= 2 ? bestRun : [];
}

function findUnpunctuatedOptionRun(source: string): OptionMarker[] {
  const candidates: OptionMarker[] = [...source.matchAll(/(?:^|\n)[ \t]*([A-J])[ \t]+(?=\S)/gim)].map((match) => {
    const markerOffset = match[0].lastIndexOf(match[1] ?? "");
    const index = (match.index ?? 0) + markerOffset;
    return { index, end: (match.index ?? 0) + match[0].length, label: (match[1] ?? "").toUpperCase() };
  });
  // Plain letters also start ordinary sentences (e.g. "A relação...").
  // Require a run of at least three sequential labels before treating them as choices.
  const run = findSequentialOptionRun(candidates);
  return run.length >= 3 ? run : [];
}

function extractQuestionAlternatives(
  optionSource: string,
  modelPrompt: string | undefined,
  modelAlternatives: ParsedQuestion["alternatives"],
): ExtractedAlternatives {
  const normalizedOptionSource = optionSource.replace(/(^|\n)(\s*)([A-H])(\d{1,3})(?=\s*(?:\n|$))/gi, "$1$2$3)$4");
  const normalizedSource = normalizedOptionSource.replace(answerKeySection, "").trimEnd();
  const optionPattern = /(?:^|[\n \t(\[])([A-J])[ \t]*[)\].:][ \t]*(?=\S)|(?:^|\n)[ \t]*(\d{1,2})[ \t]*([):-])[ \t]*(?=\S)/gi;
  const punctuationMatches: OptionMarker[] = [...normalizedSource.matchAll(optionPattern)]
    .filter((match) => Boolean(match[1]) || match[3] !== ".")
    .map((match) => {
      const label = match[1] ?? match[2] ?? "";
      return {
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        label: label.toUpperCase(),
      };
    });
  const sequentialMatches = findSequentialOptionRun(punctuationMatches);
  // Numeric dotted choices must form a consecutive block and look like short
  // answers; ordinary numbered instructions must remain part of the prompt.
  const numeric = [...normalizedSource.matchAll(/(?:^|\n)[ \t]*(\d{1,2})\.[ \t]+([^\n]+)/g)];
  const numericRun = numeric.length >= 3 && numeric[0]?.[1] === "1"
    && numeric.every((m, i) => Number(m[1]) === i + 1 && /[=]|^\s*[-−+]?\d/.test(m[2] ?? ""))
    ? numeric.map(m => ({ index: m.index ?? 0, end: (m.index ?? 0) + m[0].length - m[2]!.length, label: m[1]! })) : [];
  const matches = sequentialMatches.length >= 2
    ? sequentialMatches
    : numericRun.length ? numericRun : punctuationMatches.length === 2 ? punctuationMatches : findUnpunctuatedOptionRun(normalizedSource);
  const parsedAlternatives = matches.length >= 2 ? matches.map((match, index) => {
    const start = match.end;
    const end = matches[index + 1]?.index ?? normalizedSource.length;
    const text = normalizedSource.slice(start, end).split(/\r?\n/)
      .filter((line) => !/^\s*(?:https?:\/\/|www\.|hp\s*;)/i.test(line))
      .join("\n").trim();
    return { label: match.label, text };
  }).filter((alternative) => alternative.text.length > 0) : [];
  const validModelAlternatives = (modelAlternatives ?? []).filter((alternative) =>
    alternative.label.trim().length > 0 && alternative.text.trim().length > 0);
  // Model alternatives are already separated semantically. Re-parsing OCR can
  // absorb neighboring questions into a choice that the model separated well.
  const sourceAlternatives = validModelAlternatives.length > 0 ? validModelAlternatives : parsedAlternatives;
  const alternatives = sourceAlternatives.flatMap((alternative, index) => {
    const currentIndex = /^[A-J]$/.test(alternative.label) ? alternative.label.charCodeAt(0) : -1;
    const nextLabel = sourceAlternatives[index + 1]?.label ?? "";
    const nextIndex = /^[A-J]$/.test(nextLabel) ? nextLabel.charCodeAt(0) : -1;
    const gap = nextIndex - currentIndex - 1;
    const lines = alternative.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (gap > 0 && lines.length === gap + 1) {
      return lines.map((line, lineIndex) => ({ label: String.fromCharCode(currentIndex + lineIndex), text: line }));
    }
    return [alternative];
  }).map((alternative, index, values) => {
    const previous = values[index - 1]?.label ?? "";
    const next = values[index + 1]?.label ?? "";
    if (alternative.label === "E" && previous === "B" && next === "D") return { ...alternative, label: "C" };
    if (alternative.label === "1" && index === 0 && next === "B") return { ...alternative, label: "A" };
    return alternative;
  });
  const prompt = validModelAlternatives.length > 0
    ? modelPrompt
    : matches.length >= 2
      ? normalizedSource.slice(0, matches[0]?.index ?? 0).trim() || modelPrompt
      : modelPrompt;

  return { prompt, alternatives };
}

export { extractQuestionAlternatives };
