import assert from "node:assert/strict";
import { test } from "node:test";
import { separateQuestionAnswer } from "../src/services/question-content.service.js";
import { identifyQuestions } from "../src/services/question-identification.service.js";

test("separates an explanation placed after a Java code block", () => {
  const text = [
    "Considere o código e informe sua complexidade.",
    "public class Questao1 {",
    "public static void main(String[] args) {",
    "for (int i = 0; i < n; i++) {",
    "System.out.println(i);",
    "}",
    "}",
    "}",
    "O código possui um único laço. A complexidade de tempo é O(n).",
  ].join("\n");

  const result = separateQuestionAnswer(text);
  assert.match(result.prompt, /Considere o código/);
  assert.match(result.prompt, /public class Questao1/);
  assert.doesNotMatch(result.prompt, /A complexidade de tempo/);
  assert.equal(result.answer, "O código possui um único laço. A complexidade de tempo é O(n).");
});

test("separates an explicitly labeled answer without code", () => {
  const result = separateQuestionAnswer("Qual é a capital do Brasil?\nResposta: Brasília.");
  assert.equal(result.prompt, "Qual é a capital do Brasil?");
  assert.equal(result.answer, "Brasília.");
});

test("does not invent or split an answer when the document provides none", () => {
  const text = "Explique a diferença entre tempo linear e quadrático.";
  assert.deepEqual(separateQuestionAnswer(text), { prompt: text, answer: null });
});

test("keeps a long list of exercise parts separate from the prompt and classifies it as open response", async () => {
  const previousIdentifier = process.env.QUESTION_IDENTIFIER;
  process.env.QUESTION_IDENTIFIER = "rules";
  try {
    const [question] = await identifyQuestions([
      "1) Resolva as equações em R:\na) 2x + 6 = x + 18\nb) 5x - 3 = 2x + 9\nc) 3(2x - 3) = 3x + 18\nd) 2x + 3(x - 5) = 4x + 9\ne) 2x + 1 = 6x - 3\nf) 3x - 5 = x - 2\ng) 3x - 5 = 13\nh) 3x + 5 = 2\ni) x - (2x - 1) = 23\nj) 2x - (x - 1) = 5 - (x - 3)",
    ]);

    assert.ok(question);
    assert.equal(question.responseType, "open");
    assert.match(question.prompt ?? "", /Resolva as equações em R/);
    assert.equal(question.alternatives?.length, 10);
    assert.equal(question.alternatives?.at(-1)?.label, "J");
  } finally {
    if (previousIdentifier === undefined) delete process.env.QUESTION_IDENTIFIER;
    else process.env.QUESTION_IDENTIFIER = previousIdentifier;
  }
});

test("identifies prompts across history, science, and geography formats", async () => {
  const previousIdentifier = process.env.QUESTION_IDENTIFIER;
  process.env.QUESTION_IDENTIFIER = "rules";
  try {
    const questions = await identifyQuestions([
      "História\n1. Explique duas causas da Independência do Brasil.\n2. Assinale a alternativa correta sobre o período colonial:\na) A economia era baseada na mineração.\nb) O Brasil era independente desde 1500.\nc) Não houve colonização portuguesa.\nCiências\n3) Descreva como ocorre a fotossíntese nas plantas.\nGeografia\n4) Compare clima e tempo atmosférico, dando um exemplo.",
    ]);

    assert.deepEqual(questions.map((question) => question.number), [1, 2, 3, 4]);
    assert.equal(questions[0]?.responseType, "open");
    assert.equal(questions[1]?.responseType, "multiple_choice");
    assert.deepEqual(questions[1]?.alternatives?.map((alternative) => alternative.label), ["A", "B", "C"]);
    assert.equal(questions[2]?.responseType, "open");
    assert.equal(questions[3]?.responseType, "open");
  } finally {
    if (previousIdentifier === undefined) delete process.env.QUESTION_IDENTIFIER;
    else process.env.QUESTION_IDENTIFIER = previousIdentifier;
  }
});

test("keeps short exercise lists open as a separate rule", async () => {
  const previousIdentifier = process.env.QUESTION_IDENTIFIER;
  process.env.QUESTION_IDENTIFIER = "rules";
  try {
    const [question] = await identifyQuestions(["1) Resolva as equações:\na) 2x + 6 = 18\nb) 3x - 4 = 11"]);
    assert.ok(question);
    assert.equal(question.responseType, "open");
    assert.equal(question.alternatives?.length, 2);
  } finally {
    if (previousIdentifier === undefined) delete process.env.QUESTION_IDENTIFIER;
    else process.env.QUESTION_IDENTIFIER = previousIdentifier;
  }
});

test("classifies alternatives with a written justification as mixed", async () => {
  const previousIdentifier = process.env.QUESTION_IDENTIFIER;
  process.env.QUESTION_IDENTIFIER = "rules";
  try {
    const [question] = await identifyQuestions([
      "1) Assinale a alternativa correta e justifique sua resposta:\na) A primeira opção.\nb) A segunda opção.",
    ]);
    assert.ok(question);
    assert.equal(question.responseType, "mixed");
    assert.equal(question.alternatives?.length, 2);
  } finally {
    if (previousIdentifier === undefined) delete process.env.QUESTION_IDENTIFIER;
    else process.env.QUESTION_IDENTIFIER = previousIdentifier;
  }
});

test("keeps local code and printed-answer separation when Ollama classifies the question", async () => {
  const previousIdentifier = process.env.QUESTION_IDENTIFIER;
  const previousModel = process.env.OLLAMA_MODEL;
  const originalFetch = globalThis.fetch;
  process.env.QUESTION_IDENTIFIER = "ollama";
  process.env.OLLAMA_MODEL = "qwen3:4b";
  const pageText = [
    "1) Qual é a complexidade de tempo desse algoritmo?",
    "public class Questao1 {",
    "    public static void main(String[] args) {",
    "        for (int i = 0; i < n; i++) {",
    "            System.out.println(i);",
    "        }",
    "    }",
    "}",
    "O código possui um único laço. A complexidade de tempo é O(n).",
  ].join("\n");
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: {
      content: JSON.stringify({
        classifications: [{ questionIndex: 0, responseType: "open", confidence: "high" }],
      }),
    },
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const [question] = await identifyQuestions([pageText]);
    assert.ok(question);
    assert.match(question.prompt ?? "", /public class Questao1/);
    assert.match(question.answer ?? "", /O código possui um único laço/);
    assert.doesNotMatch(question.answer ?? "", /^O complexidade/);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousIdentifier === undefined) delete process.env.QUESTION_IDENTIFIER;
    else process.env.QUESTION_IDENTIFIER = previousIdentifier;
    if (previousModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = previousModel;
  }
});

