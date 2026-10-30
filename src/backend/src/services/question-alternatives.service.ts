import type { ParsedQuestion } from "./question-parser.service.js";

type Alternative = NonNullable<ParsedQuestion["alternatives"]>[number];
type ExtractedAlternatives = { prompt?: string; alternatives: Alternative[] };
type OptionMarker = { index: number; end: number; label: string };

function findUnpunctuatedOptionRun(source: string): OptionMarker[] {
  const candidates: OptionMarker[] = [...source.matchAll(/(?:^|\n)[ \t]*([A-J])[ \t]+(?=\S)/gim)].map((match) => {
    const markerOffset = match[0].lastIndexOf(match[1] ?? "");
    const index = (match.index ?? 0) + markerOffset;
    return { index, end: (match.index ?? 0) + match[0].length, label: (match[1] ?? "").toUpperCase() };
  });
  let bestRun: OptionMarker[] = [];
  for (let start = 0; start < candidates.length; start += 1) {
    const run = [candidates[start]!];
    for (let index = start + 1; index < candidates.length; index += 1) {
      const previous = run.at(-1)!;
      const current = candidates[index]!;
      if (current.label.charCodeAt(0) !== previous.label.charCodeAt(0) + 1) break;
      run.push(current);
    }
    if (run.length > bestRun.length) bestRun = run;
  }
  // Plain letters also start ordinary sentences (e.g. "A relação...").
  // Require a run of at least three sequential labels before treating them as choices.
  return bestRun.length >= 3 ? bestRun : [];
}

function extractQuestionAlternatives(
  optionSource: string,
  modelPrompt: string | undefined,
  modelAlternatives: ParsedQuestion["alternatives"],
): ExtractedAlternatives {
  const hasOptionMarker = /(?:^|\n|\s)[A-J]\s*[).:-]\s*\S/i.test(optionSource);
  const normalizedSource = hasOptionMarker
    ? optionSource.replace(/(^|\n)(\s*)([A-H])(\d{1,3})(?=\s*(?:\n|$))/gi, "$1$2$3)$4")
    : optionSource;
  const optionPattern = /(?:^|\n|\s)([A-J])\s*([).:-])\s*(?=\S)|(?:^|\n)\s*(\d{1,2})\s*([):-])\s*(?=\S)/gi;
  const punctuationMatches: OptionMarker[] = [...normalizedSource.matchAll(optionPattern)]
    .filter((match) => Boolean(match[1]) || match[4] !== ".")
    .map((match) => ({
      index: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      label: (match[1] ?? match[3] ?? "").toUpperCase(),
    }));
  const matches = punctuationMatches.length >= 2 ? punctuationMatches : findUnpunctuatedOptionRun(normalizedSource);
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
export type { ExtractedAlternatives };
