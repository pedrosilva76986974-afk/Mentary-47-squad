import assert from "node:assert/strict";
import { test } from "node:test";
import { identifyQuestions } from "../src/services/question-identification.service.js";

const previousIdentifier = process.env.QUESTION_IDENTIFIER;
process.env.QUESTION_IDENTIFIER = "rules";

test("keeps only objective questions and preserves incomplete objective items for review", async () => {
  const questions = await identifyQuestions([
    "História\n1. Explique duas causas da Independência do Brasil.\n2. Assinale a alternativa correta sobre o período colonial:\na) A economia era baseada na mineração.\nb) O Brasil era independente desde 1500.\nc) Não houve colonização portuguesa.\nCiências\n3) Descreva como ocorre a fotossíntese nas plantas.\n4) Marque a alternativa correta sobre células.",
  ]);

  assert.deepEqual(questions.map((question) => question.number), [2, 4]);
  assert.deepEqual(questions[0]?.alternatives?.map((alternative) => alternative.label), ["A", "B", "C"]);
  assert.equal(questions[0]?.responseType, "multiple_choice");
  assert.deepEqual(questions[1]?.alternatives, []);
  assert.ok(questions[1]?.missingComponents?.includes("alternatives"));
});

test("does not treat lettered calculation exercises as multiple-choice alternatives", async () => {
  const questions = await identifyQuestions([
    "1) Resolva as seguintes equações em R:\na) 2x + 6 = x + 18\nb) 5x - 3 = 2x + 9\nc) 3(2x - 3) = 3x + 18\nd) 2x + 3(x - 5) = 4x + 9\ne) 2x + 1 = 6x - 3\nf) 3x - 5 = x - 2\ng) 3x - 5 = 13\nh) 3x + 5 = 2\ni) x - (2x - 1) = 23\nj) 2x - (x - 1) = 5 - (x - 3)",
  ]);
  assert.deepEqual(questions, []);
});

test("keeps multiple-choice questions even when they also request a justification", async () => {
  const [question] = await identifyQuestions([
    "1) Assinale a alternativa correta e justifique sua escolha:\na) A primeira opção.\nb) A segunda opção.",
  ]);
  assert.ok(question);
  assert.equal(question.responseType, "multiple_choice");
  assert.equal(question.alternatives?.length, 2);
});

test("retains numbered questions when OCR loses choices without an explicit selection instruction", async () => {
  const questions = await identifyQuestions([
    "Questão 1: Qual é a capital do Brasil?\nQuestão 2: Explique a importância da água.",
  ]);
  assert.deepEqual(questions.map((question) => question.number), [1]);
  assert.match(questions[0]!.prompt!, /capital do Brasil/);
  assert.ok(questions[0]!.missingComponents!.includes("alternatives"));
  assert.ok(questions[0]!.missingComponents!.includes("answer"));
});

test.after(() => {
  if (previousIdentifier === undefined) delete process.env.QUESTION_IDENTIFIER;
  else process.env.QUESTION_IDENTIFIER = previousIdentifier;
});
