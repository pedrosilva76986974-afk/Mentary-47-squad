import type { Region } from "./source-preview.service.js";
export type PositionedText = { text: string; x: number; y: number; width: number; height: number };
export type QuestionRegion = { page: number; number: number; text: string; region: Region };
export function locateQuestionRegions(lines: PositionedText[], page: number): QuestionRegion[] {
  const anchors = lines.flatMap(line => {
    const match = line.text.trim().match(/^(?:Quest(?:ão|ao)\s*(?:n[º°o.]?\s*)?)?(\d{1,3})\s*[).:-]\s*(.*)/i);
    if (!match || Number(match[1]) < 1 || !match[2]?.trim()) return [];
    return [{ ...line, number: Number(match[1]), text: match[2].trim() }];
  });
  const columns = anchors.some(a => a.x >= .48) && anchors.some(a => a.x < .3);
  return anchors.map(anchor => {
    const right = columns && anchor.x >= .48;
    const next = anchors.filter(other => other.y > anchor.y + .005 && (!columns || (other.x >= .48) === right)).sort((a,b) => a.y-b.y)[0];
    const y = Math.max(0, anchor.y - .012);
    return { page, number: anchor.number, text: anchor.text,
      region: { x: right ? .5 : 0, y, width: columns ? .5 : 1, height: Math.max(.01, (next ? next.y - .012 : 1) - y) } };
  });
}
export function regionMatchesQuestion(region: QuestionRegion, question: { number: number | null; prompt?: string; text?: string }): boolean {
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const head = normalize(region.text).slice(0, 30);
  return question.number === region.number && head.length >= 5 && normalize(question.prompt ?? question.text ?? "").includes(head);
}
