import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPrintedAnswerKey } from "../src/services/answer-key.service.js";
import type { ParsedQuestion } from "../src/services/question-parser.service.js";

const question: ParsedQuestion = {
  number: 3,
  text: "Sobre hardware?",
  prompt: "Sobre hardware?",
  answer: null,
  responseType: "multiple_choice",
  alternatives: [
    { label: "A", text: "Software de sistemas." },
    { label: "B", text: "Software aplicativo." },
    { label: "C", text: "Hardware." },
  ],
  missingComponents: ["answer"],
  pageStart: 1,
  pageEnd: 1,
  confidence: "high",
};

test("answer key associates a numbered printed choice with its question", () => {
  const [result] = applyPrintedAnswerKey([question], ["GABARITO\n3-B"]);

  assert.equal(result?.answerKey, "B");
  assert.equal(result?.answer, null);
  assert.deepEqual(result?.missingComponents, []);
});

test("answer key leaves an answer unset when its label is not present among alternatives", () => {
  const [result] = applyPrintedAnswerKey([question], ["GABARITO\n3-E"]);

  assert.equal(result?.answerKey, undefined);
  assert.deepEqual(result?.missingComponents, ["answer"]);
});

test("answer key does not replace an answer key already identified in the question", () => {
  const [result] = applyPrintedAnswerKey([{ ...question, answerKey: "A" }], ["GABARITO\n3-B"]);

  assert.equal(result?.answerKey, "A");
});

test("answer key reads compact labels with or without punctuation", () => {
  const [first, second, third] = applyPrintedAnswerKey(
    [question, { ...question, number: 4 }, { ...question, number: 5 }],
    ["Gabarito: 3-A 4 B 5-C"],
  );

  assert.equal(first?.answerKey, "A");
  assert.equal(second?.answerKey, "B");
  assert.equal(third?.answerKey, "C");
});

test("answer key ignores numbered explanatory prose after the key section", () => {
  const [result] = applyPrintedAnswerKey([question], [
    "Gabarito",
    "Comentários das respostas:",
    "3) A resposta correta deve considerar as alternativas disponíveis.",
  ]);

  assert.equal(result?.answerKey, undefined);
});

test("answer key pairs question-number rows with answer-letter rows", () => {
  const [first, second, third] = applyPrintedAnswerKey(
    [question, { ...question, number: 4 }, { ...question, number: 5 }],
    ["Gabarito", "3 4 5", "A C B"],
  );

  assert.equal(first?.answerKey, "A");
  assert.equal(second?.answerKey, "C");
  assert.equal(third?.answerKey, "B");
});
