import assert from "node:assert/strict";
import { test } from "node:test";
import { getMissingAnswerMessage, getResponseTypeLabel } from "../../frontend/src/utils/question-presentation.js";

test("question presentation labels each response type in Portuguese", () => {
  assert.equal(getResponseTypeLabel("open"), "Resposta aberta");
  assert.equal(getResponseTypeLabel("multiple_choice"), "Múltipla escolha");
  assert.equal(getResponseTypeLabel("mixed"), "Formato misto");
  assert.equal(getResponseTypeLabel("unknown"), "Tipo não identificado");
});

test("question presentation explains when an answer is not present", () => {
  assert.equal(getMissingAnswerMessage("open"), "Resposta aberta; o documento não informa uma resposta pronta.");
  assert.equal(getMissingAnswerMessage("multiple_choice"), "Nenhuma resposta ou alternativa foi identificada no documento.");
});
