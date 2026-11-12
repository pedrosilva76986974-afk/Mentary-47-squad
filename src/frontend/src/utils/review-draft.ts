import type { Question, ReviewUpdate } from "../types/review.js";

/** Use the same defaults for manual edits and incoming classification suggestions. */
export function createQuestionDraft(question: Question): ReviewUpdate {
  return {
    pageStart: question.pageStart,
    pageEnd: question.pageEnd,
    visualReferences: question.visualReferences,
    prompt: question.prompt ?? question.text,
    alternatives: question.alternatives ?? [],
    answerKey: question.answerKey ?? null,
    pedagogy: question.pedagogy ?? {},
    reviewedBy: question.reviewedBy ?? "",
  };
}

/** A response must not discard edits made while its save request was in flight. */
export function clearSavedDraft(
  drafts: Record<string, ReviewUpdate>,
  questionId: string,
  saved: ReviewUpdate,
): Record<string, ReviewUpdate> {
  if (!drafts[questionId] || JSON.stringify(drafts[questionId]) !== JSON.stringify(saved)) return drafts;
  const remaining = { ...drafts };
  delete remaining[questionId];
  return remaining;
}
