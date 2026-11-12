import assert from "node:assert/strict";
import { test } from "node:test";
import { clearSavedDraft, createQuestionDraft } from "../../frontend/src/utils/review-draft.js";
import type { Question } from "../../frontend/src/types/review.js";

const question: Question = {
  id: "question-1",
  number: 1,
  text: "Texto original",
  pageStart: null,
  pageEnd: null,
  status: "pending_review",
};

test("a delayed save response keeps edits made after the request and other question drafts", () => {
  const sent = createQuestionDraft(question);
  const other = { ...sent, prompt: "Outra questão" };
  assert.deepEqual(clearSavedDraft({ q1: sent, q2: other }, "q1", sent), { q2: other });
  const edited = { ...sent, prompt: "Edição durante o salvamento" };
  const drafts = { q1: edited, q2: other };
  assert.deepEqual(clearSavedDraft(drafts, "q1", sent), drafts);
  assert.equal(drafts.q1.prompt, "Edição durante o salvamento");
});

test("review drafts preserve unknown pages and use original text for incomplete questions", () => {
  assert.deepEqual(createQuestionDraft(question), {
    pageStart: null,
    pageEnd: null,
    visualReferences: undefined,
    prompt: "Texto original",
    alternatives: [],
    answerKey: null,
    pedagogy: {},
    reviewedBy: "",
  });
});

test("review drafts preserve saved content, answer keys, pedagogy and visual sources", () => {
  const saved: Question = {
    ...question,
    prompt: "",
    alternatives: [{ label: "B", text: "Resposta" }],
    answerKey: "B",
    pedagogy: { discipline: "Matemática", bnccSkills: ["EF01MA01"] },
    reviewedBy: "Docente",
    pageStart: 2,
    pageEnd: 3,
    visualReferences: [{ page: 2, kind: "image", association: "manual" }],
  };
  const draft = createQuestionDraft(saved);
  assert.deepEqual(draft, {
    prompt: saved.prompt,
    alternatives: saved.alternatives,
    answerKey: saved.answerKey,
    pedagogy: saved.pedagogy,
    reviewedBy: saved.reviewedBy,
    pageStart: saved.pageStart,
    pageEnd: saved.pageEnd,
    visualReferences: saved.visualReferences,
  });
  assert.equal(saved.status, "pending_review");
});

