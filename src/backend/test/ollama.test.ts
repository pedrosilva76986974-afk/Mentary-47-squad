import assert from "node:assert/strict";
import { test } from "node:test";
import { identifyQuestionsDetailed } from "../src/services/question-identification.service.js";

const originalFetch = globalThis.fetch;

function setOllamaEnvironment(): void {
  process.env.QUESTION_IDENTIFIER = "ollama";
  process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
  process.env.OLLAMA_MODEL = "qwen3:4b";
  process.env.OLLAMA_KEEP_ALIVE = "15m";
}

function readEnvironment(): Record<string, string | undefined> {
  return Object.fromEntries(["QUESTION_IDENTIFIER", "OLLAMA_BASE_URL", "OLLAMA_MODEL", "OLLAMA_TIMEOUT_MS", "OLLAMA_KEEP_ALIVE"].map((key) => [key, process.env[key]]));
}

function restoreEnvironment(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  globalThis.fetch = originalFetch;
}

function classificationResponse(entries: unknown[], duration = 1_450_000_000): Response {
  return new Response(JSON.stringify({
    message: { content: JSON.stringify({ classifications: entries }) },
    total_duration: duration,
    load_duration: 350_000_000,
    prompt_eval_count: 200,
    eval_count: 20,
  }), { status: 200, headers: { "content-type": "application/json" } });
}

test("Ollama classifies locally structured questions without generating or changing their content", async () => {
  const previous = readEnvironment();
  setOllamaEnvironment();
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "http://127.0.0.1:11434/api/chat");
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      format: { properties: { classifications: unknown } };
    };
    assert.equal(body.model, "qwen3:4b");
    const system = body.messages.find((message) => message.role === "system")?.content ?? "";
    assert.match(system, /Não extraia, transcreva, reescreva/);
    assert.doesNotMatch(system, /Extraia questões/);
    const state = JSON.parse(body.messages.find((message) => message.role === "user")?.content ?? "[]") as Array<Record<string, unknown>>;
    assert.equal(state.length, 1);
    assert.equal(state[0]?.number, 1);
    assert.equal(state[0]?.prompt, "Qual é a capital do Brasil?");
    assert.deepEqual(state[0]?.alternatives, [
      { label: "A", text: "Brasília" },
      { label: "B", text: "Salvador" },
    ]);
    assert.equal("text" in state[0]!, false);
    assert.equal("answer" in state[0]!, false);
    assert.deepEqual(Object.keys(body.format.properties), ["classifications"]);
    return classificationResponse([{ questionIndex: 0, responseType: "multiple_choice", confidence: "high" }]);
  };

  try {
    const result = await identifyQuestionsDetailed(["Questão 1: Qual é a capital do Brasil?\nA) Brasília\nB) Salvador"]);
    const question = result.questions[0];
    assert.ok(question);
    assert.equal(question.responseType, "multiple_choice");
    assert.equal(question.prompt, "Qual é a capital do Brasil?");
    assert.deepEqual(question.alternatives, [
      { label: "A", text: "Brasília" },
      { label: "B", text: "Salvador" },
    ]);
    assert.equal(question.answer ?? null, null);
    assert.equal(result.diagnostics.method, "ollama");
    assert.deepEqual(result.diagnostics.ollama, { durationMs: 1450, loadDurationMs: 350, promptTokens: 200, outputTokens: 20 });
  } finally {
    restoreEnvironment(previous);
  }
});

test("keeps local segmentation when Ollama has low confidence or returns an incompatible type", async () => {
  const previous = readEnvironment();
  setOllamaEnvironment();
  globalThis.fetch = async () => classificationResponse([
    { questionIndex: 0, responseType: "open", confidence: "high" },
    { questionIndex: 1, responseType: "mixed", confidence: "medium" },
  ]);
  try {
    const result = await identifyQuestionsDetailed([
      "1) Qual é a capital do Brasil?\nA) Brasília\nB) Salvador\n2) Explique a importância da água.",
    ]);
    assert.equal(result.questions.length, 2);
    assert.equal(result.questions[0]?.responseType, "multiple_choice");
    assert.deepEqual(result.questions[0]?.alternatives, [
      { label: "A", text: "Brasília" },
      { label: "B", text: "Salvador" },
    ]);
    assert.equal(result.questions[1]?.responseType, "open");
    assert.equal(result.diagnostics.method, "ollama+rules");
    assert.match(result.diagnostics.reason ?? "", /baixa confiança ou incompatibilidade/);
  } finally {
    restoreEnvironment(previous);
  }
});

test("falls back to local classification when Ollama is unavailable", async () => {
  const previous = readEnvironment();
  const originalError = console.error;
  setOllamaEnvironment();
  globalThis.fetch = async () => new Response("model not found", { status: 404 });
  console.error = () => undefined;
  try {
    const result = await identifyQuestionsDetailed(["Questão 1: Explique a importância da água."]);
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0]?.responseType, "open");
    assert.equal(result.diagnostics.method, "rules");
    assert.match(result.diagnostics.reason ?? "", /HTTP 404/);
  } finally {
    console.error = originalError;
    restoreEnvironment(previous);
  }
});

test("does not drop local questions when Ollama returns an invalid classification index", async () => {
  const previous = readEnvironment();
  const originalError = console.error;
  setOllamaEnvironment();
  globalThis.fetch = async () => classificationResponse([{ questionIndex: 8, responseType: "multiple_choice", confidence: "high" }]);
  console.error = () => undefined;
  try {
    const result = await identifyQuestionsDetailed(["Questão 1: Explique a importância da água."]);
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0]?.prompt, "Explique a importância da água.");
    assert.equal(result.diagnostics.method, "rules");
  } finally {
    console.error = originalError;
    restoreEnvironment(previous);
  }
});

test("does not call Ollama when local parsing finds no questions", async () => {
  const previous = readEnvironment();
  setOllamaEnvironment();
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return classificationResponse([]);
  };
  try {
    const result = await identifyQuestionsDetailed(["Documento sem questão avaliativa."]);
    assert.equal(result.questions.length, 0);
    assert.equal(calls, 0);
  } finally {
    restoreEnvironment(previous);
  }
});
