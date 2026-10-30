import assert from "node:assert/strict";
import { test } from "node:test";
import { extractQuestionAlternatives } from "../src/services/question-alternatives.service.js";

test("keeps alternatives separated by the model instead of reparsing noisy neighboring text", () => {
  const result = extractQuestionAlternatives(
    "A texto de OCR B fragmento da próxima questão A outro bloco B outro bloco",
    "Sobre hardware?",
    [
      { label: "A", text: "Software de sistemas." },
      { label: "B", text: "Software aplicativo." },
    ],
  );

  assert.equal(result.prompt, "Sobre hardware?");
  assert.deepEqual(result.alternatives, [
    { label: "A", text: "Software de sistemas." },
    { label: "B", text: "Software aplicativo." },
  ]);
});

test("recovers lowercase OCR alternatives and removes URL references from their text", () => {
  const result = extractQuestionAlternatives(
    "Assinale a opção correta:\na) Primeira opção\nb) Segunda opção\nhttps://example.com/fonte",
    undefined,
    [],
  );

  assert.equal(result.prompt, "Assinale a opção correta:");
  assert.deepEqual(result.alternatives, [
    { label: "A", text: "Primeira opção" },
    { label: "B", text: "Segunda opção" },
  ]);
});

test("expands a missing OCR label when its option text contains separate lines", () => {
  const result = extractQuestionAlternatives("A) Um\nDois\nTrês\nD) Quatro", undefined, []);

  assert.equal(result.prompt, undefined);
  assert.deepEqual(result.alternatives, [
    { label: "A", text: "Um" },
    { label: "B", text: "Dois" },
    { label: "C", text: "Três" },
    { label: "D", text: "Quatro" },
  ]);
});

test("recognizes PDF alternatives labeled with a letter and spaces but no punctuation", () => {
  const result = extractQuestionAlternatives(
    "A relação entre as citações reside na crença de que é necessário\nA  dar oportunidade a pessoas necessitadas.\nB  identificar contextos de perigo.\nC  tirar proveito de situações adversas.\nD  evitar dificuldades intransponíveis.\nE  contestar circunstâncias harmônicas.",
    undefined,
    [],
  );

  assert.equal(result.prompt, "A relação entre as citações reside na crença de que é necessário");
  assert.deepEqual(result.alternatives, [
    { label: "A", text: "dar oportunidade a pessoas necessitadas." },
    { label: "B", text: "identificar contextos de perigo." },
    { label: "C", text: "tirar proveito de situações adversas." },
    { label: "D", text: "evitar dificuldades intransponíveis." },
    { label: "E", text: "contestar circunstâncias harmônicas." },
  ]);
});
