import type { Question, ReviewUpdate } from "../types/review.js";

/** Use the same defaults for manual edits and incoming classification suggestions. */
export function createQuestionDraft(question: Question): ReviewUpdate {
  return {
    ...(question.revision ? { expectedRevision: question.revision } : {}),
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

export type SavedReviewDraft = { version: 1; documentId: string; expiresAt: number; drafts: Record<string, ReviewUpdate> };
export const draftStorageKey = (documentId: string) => `mentary:review-drafts:v1:${documentId}`;

export function serializeReviewDraft(documentId: string, drafts: Record<string, ReviewUpdate>, now = Date.now()): string {
  return JSON.stringify({ version: 1, documentId, expiresAt: now + 7 * 86400000, drafts });
}

export function parseReviewDraft(raw: string | null, documentId: string, now = Date.now()): SavedReviewDraft | null {
  if (!raw || raw.length > 1000000) return null;
  try {
    const saved = JSON.parse(raw) as SavedReviewDraft;
    if (saved.version !== 1 || saved.documentId !== documentId || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= now || !saved.drafts || Array.isArray(saved.drafts) || typeof saved.drafts !== "object") return null;
    if (Object.entries(saved.drafts).some(([id, draft]) => !id.startsWith(`${documentId}-q`) || !draft || typeof draft.prompt !== "string" || !Array.isArray(draft.alternatives) || !draft.pedagogy || typeof draft.pedagogy !== "object")) return null;
    return Object.keys(saved.drafts).length ? saved : null;
  } catch { return null; }
}

export function recoverableDrafts(saved: SavedReviewDraft, questions: Question[]): Record<string, ReviewUpdate> {
  return Object.fromEntries(Object.entries(saved.drafts).filter(([id, draft]) => {
    const question = questions.find(item => item.id === id);
    return question?.revision && draft.expectedRevision === question.revision;
  }));
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
