import assert from "node:assert/strict";
import { test } from "node:test";
import { findQuestionVisualReferences } from "../src/services/review-results.service.js";

test("review questions link only visual pages within their page range", () => {
  const references = findQuestionVisualReferences(
    { pageStart: 2, pageEnd: 3 },
    [
      { page: 1, kind: "graphic" },
      { page: 2, kind: "image" },
      { page: 3, kind: "graphic" },
      { page: 4, kind: "image" },
    ],
  );

  assert.deepEqual(references, [
    { page: 2, kind: "image" },
    { page: 3, kind: "graphic" },
  ]);
});

test("review questions have no visual references when no page elements were detected", () => {
  assert.deepEqual(findQuestionVisualReferences({ pageStart: 1, pageEnd: 1 }), []);
});
