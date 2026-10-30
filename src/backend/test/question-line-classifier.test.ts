import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyQuestionLine } from "../src/services/question-line-classifier.service.js";

test("classifies explicit question markers and keeps code class names out of question numbering", () => {
  assert.deepEqual(classifyQuestionLine("QUESTÃO 03: Explique o conceito."), {
    kind: "explicit-label",
    number: 3,
    text: "Explique o conceito.",
  });
  assert.deepEqual(classifyQuestionLine("public class Questao1 {"), { kind: "other" });
});

test("classifies isolated and numbered question labels, flagging equation-like lines", () => {
  assert.deepEqual(classifyQuestionLine("4."), { kind: "standalone-number", number: 4 });
  assert.deepEqual(classifyQuestionLine("5) Determine o valor de x."), {
    kind: "numbered-prompt",
    number: 5,
    text: "Determine o valor de x.",
    startsWithWords: true,
  });
  assert.deepEqual(classifyQuestionLine("2) 22x + 12"), {
    kind: "numbered-prompt",
    number: 2,
    text: "22x + 12",
    startsWithWords: false,
  });
});

test("classifies unnumbered direct questions separately from continuation text", () => {
  assert.deepEqual(classifyQuestionLine("Qual é a capital do Brasil?"), {
    kind: "direct-prompt",
    text: "Qual é a capital do Brasil?",
  });
  assert.deepEqual(classifyQuestionLine("Texto de apoio sem pergunta."), { kind: "other" });
});
