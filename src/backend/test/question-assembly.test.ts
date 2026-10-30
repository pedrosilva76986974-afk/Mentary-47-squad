import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendQuestionLine,
  createQuestionDraft,
  finalizeQuestionDraft,
  mergeQuestionFragments,
} from "../src/services/question-assembly.service.js";

test("question assembly tracks continuation text and page range", () => {
  const draft = createQuestionDraft(1, "Explique a ideia principal.", 1, false, true);
  appendQuestionLine(draft, "Texto de apoio da página seguinte.", 2);
  appendQuestionLine(draft, "   ", 2);

  assert.deepEqual(finalizeQuestionDraft(draft), {
    number: 1,
    text: "Explique a ideia principal.\nTexto de apoio da página seguinte.",
    pageStart: 1,
    pageEnd: 2,
    confidence: "medium",
  });
});

test("question assembly preserves explicitly labeled incomplete candidates", () => {
  const draft = createQuestionDraft(7, "", 3, true);

  assert.deepEqual(finalizeQuestionDraft(draft), {
    number: 7,
    text: "",
    pageStart: 3,
    pageEnd: 3,
    confidence: "high",
  });
});

test("fragment merging joins duplicate same-page labels and preserves cross-page questions", () => {
  const merged = mergeQuestionFragments([
    { number: 1, text: "Enunciado", pageStart: 1, pageEnd: 1, confidence: "medium" },
    { number: 1, text: "Texto de apoio", pageStart: 1, pageEnd: 1, confidence: "high" },
    { number: 2, text: "Continuação", pageStart: 2, pageEnd: 2, confidence: "medium" },
    { number: 2, text: "Outro bloco numerado", pageStart: 3, pageEnd: 3, confidence: "medium" },
  ]);

  assert.equal(merged.length, 3);
  assert.equal(merged[0]?.text, "Enunciado\nTexto de apoio");
  assert.equal(merged[0]?.confidence, "high");
  assert.deepEqual(merged.slice(1).map((question) => [question.number, question.pageStart]), [[2, 2], [2, 3]]);
});
