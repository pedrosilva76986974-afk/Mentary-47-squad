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

test("recognizes alternatives wrapped in parentheses and brackets", () => {
  const parenthesized = extractQuestionAlternatives(
    "Qual é o consumo total?\n(A) 1.270 W\n(B) 1.220 W\n(C) 1.170 W",
    undefined,
    [],
  );
  const bracketed = extractQuestionAlternatives(
    "A que termo o pronome se refere?\n[A] Inteligência artificial\n[B] Discernimento humano\n[C] Processamento de dados",
    undefined,
    [],
  );

  assert.deepEqual(parenthesized.alternatives, [
    { label: "A", text: "1.270 W" },
    { label: "B", text: "1.220 W" },
    { label: "C", text: "1.170 W" },
  ]);
  assert.deepEqual(bracketed.alternatives, [
    { label: "A", text: "Inteligência artificial" },
    { label: "B", text: "Discernimento humano" },
    { label: "C", text: "Processamento de dados" },
  ]);
});

test("does not treat assertion numerals or V/F values as alternative labels", () => {
  const assertions = extractQuestionAlternatives(
    "Analise as afirmativas:\nI. A criptografia simétrica usa a mesma chave.\nII. RSA usa chaves públicas e privadas.\nIII. Hash permite recuperar o texto original.\nÉ correto:\nA) Apenas I.\nB) Apenas III.\nC) Apenas I e II.",
    undefined,
    [],
  );
  const trueFalse = extractQuestionAlternatives(
    "A sequência correta é:\nA) V - F - V - F B) F - V - V - V C) F - F - V - V D) V - V - F - F E) F - V - F - V",
    undefined,
    [],
  );

  assert.deepEqual(assertions.alternatives, [
    { label: "A", text: "Apenas I." },
    { label: "B", text: "Apenas III." },
    { label: "C", text: "Apenas I e II." },
  ]);
  assert.deepEqual(trueFalse.alternatives, [
    { label: "A", text: "V - F - V - F" },
    { label: "B", text: "F - V - V - V" },
    { label: "C", text: "F - F - V - V" },
    { label: "D", text: "V - V - F - F" },
    { label: "E", text: "F - V - F - V" },
  ]);
});

test("stops the final alternative before the printed answer key", () => {
  const result = extractQuestionAlternatives(
    "Assinale a ordem correta:\nA) 3, 1, 2\nB) 1, 2, 3\nC) 2, 3, 1\nGABARITO OFICIAL:\nQ09: A",
    undefined,
    [],
  );

  assert.deepEqual(result.alternatives, [
    { label: "A", text: "3, 1, 2" },
    { label: "B", text: "1, 2, 3" },
    { label: "C", text: "2, 3, 1" },
  ]);
});
