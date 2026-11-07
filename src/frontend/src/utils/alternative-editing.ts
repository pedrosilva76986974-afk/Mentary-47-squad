export type Alternative = { label: string; text: string };
function matchesAnswer(label: string, answerKey: string | null) {
  return Boolean(answerKey?.trim()) && label.trim().toUpperCase() === answerKey?.trim().toUpperCase();
}
export function editAlternative(alternatives: Alternative[], answerKey: string | null, index: number, change: Partial<Alternative>) {
  const old = alternatives[index];
  if (!old) return { alternatives, answerKey };
  const next = alternatives.map((item, i) => i === index ? { ...item, ...change } : item);
  return { alternatives: next, answerKey: matchesAnswer(old.label, answerKey) ? next[index]!.label || null : answerKey };
}
export function removeAlternative(alternatives: Alternative[], answerKey: string | null, index: number) {
  return { alternatives: alternatives.filter((_, i) => i !== index), answerKey: alternatives[index] && matchesAnswer(alternatives[index]!.label, answerKey) ? null : answerKey };
}
export function nextAlternativeLabel(alternatives: Alternative[]): string {
  const labels = new Set(alternatives.map(a => a.label.toUpperCase()));
  const numeric = alternatives.length > 0 && alternatives.every(a => /^\d+$/.test(a.label));
  for (let i = 1; i <= 1000; i++) {
    const candidate = numeric || i > 26 ? String(i) : String.fromCharCode(64 + i);
    if (!labels.has(candidate)) return candidate;
  }
  return String(alternatives.length + 1);
}
