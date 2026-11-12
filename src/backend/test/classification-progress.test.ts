import assert from "node:assert/strict";
import { test } from "node:test";
import type { PedagogicalJob } from "../../frontend/src/types/review.js";
import { classificationProgress } from "../../frontend/src/utils/classification-progress.js";

test("cancelled and failed classifications explicitly distinguish partial results from completion", () => {
  const suggestions: PedagogicalJob["suggestions"] = [{
    questionId: "q1", area: "Matemática", discipline: "Matemática", questionType: "Múltipla escolha",
    grade: "", topic: "Adição", descriptor: "Somar", difficulty: "easy",
  }];
  for (const status of ["cancelled", "failed"] as const) {
    const progress = classificationProgress({ status, suggestions, error: "Tempo excedido." }, 3);
    assert.match(progress.message, /1 de 3.*parciais preservados/);
    assert.notEqual(progress.label, "Concluída");
  }
  const completed = classificationProgress({ status: "completed", suggestions }, 1);
  assert.equal(completed.label, "Concluída");
  assert.doesNotMatch(completed.message, /parciais/);
  assert.equal(classificationProgress({ status: "queued", suggestions: [] }, 3).label, "Na fila");
});
