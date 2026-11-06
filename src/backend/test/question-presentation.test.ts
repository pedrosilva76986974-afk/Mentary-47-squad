import assert from "node:assert/strict";
import { test } from "node:test";
import { getMissingAnswerMessage, getResponseTypeLabel } from "../../frontend/src/utils/question-presentation.js";

test("question presentation consistently labels objective questions", () => {
  assert.equal(getResponseTypeLabel(), "Múltipla escolha");
});

test("question presentation explains when an answer key or alternatives are missing", () => {
  assert.equal(getMissingAnswerMessage(), "Nenhum gabarito ou alternativa foi identificado no documento.");
});
