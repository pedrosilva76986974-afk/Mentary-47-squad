import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { app } from "../src/app.js";
import { identifyQuestionsDetailed } from "../src/services/question-identification.service.js";
import { saveReviewResult } from "../src/services/review-results.service.js";
import { classifyPedagogy, areaForDiscipline } from "../src/services/ollama.service.js";

const suggestion = { questionIndex: 0, area: "Matemática", discipline: "Matemática", questionType: "Múltipla escolha", grade: "1º ano", topic: "Adição", descriptor: "Somar números naturais", difficulty: "easy", bnccSkills: ["EF01MA08"], rationale: "Adição de números naturais; conferir etapa.", confidence: "medium" };
function response(value: unknown) { return new Response(JSON.stringify({ message: { content: JSON.stringify(value) } }), { status: 200 }); }
async function done(url: string) {
  for (let i = 0; i < 200; i++) {
    const r = await request(app).get(url);
    if (["completed", "failed"].includes(r.body.status)) return r.body;
    await new Promise(r => setTimeout(r, 10));
  }
  throw new Error("Job did not finish");
}
test("post-extraction pedagogical classification lifecycle", async t => {
  const directory = await mkdtemp(join(tmpdir(), "mentary-pedagogy-"));
  const previous = { ...process.env }; const fetch = globalThis.fetch;
  process.env.MENTARY_REVIEW_DIRECTORY = join(directory, "reviews");
  process.env.MENTARY_CLASSIFICATION_DIRECTORY = join(directory, "jobs");
  process.env.QUESTION_IDENTIFIER = "ollama"; process.env.OLLAMA_MODEL = "test-model";
  delete process.env.DATABASE_URL;
  try {
    let calls = 0;
    let release!: (r: Response) => void;
    globalThis.fetch = async () => { calls++; return new Promise<Response>(r => { release = r; }); };
    const parsed = await identifyQuestionsDetailed(["Questão 1: Quanto é 2 + 2? A) 3 B) 4"]);
    assert.equal(calls, 0, "Extraction must never call Ollama");
    const id = randomUUID();
    await saveReviewResult({ id, fileName: "test.pdf", mimeType: "application/pdf", size: 10, sha256: "test", uploadedAt: new Date().toISOString() },
      { pages: 1, method: "pdf-text", text: "test", pageTexts: ["test"] }, parsed.questions);
    const url = `/documents/${id}/classification`;
    await t.test("returns 202 while model is still pending and deduplicates starts", async () => {
      const start = await request(app).post(url); assert.equal(start.status, 202);
      const second = await request(app).post(url); assert.equal(second.status, 202);
      assert.equal(calls, 1);
      release(response({ suggestions: [suggestion] }));
      const job = await done(url); assert.equal(job.status, "completed");
      assert.equal(job.suggestions[0].topic, "Adição");
      assert.equal("bnccSkills" in job.suggestions[0], false);
      assert.equal(job.suggestions[0].questionId, `${id}-q1`);
      const review = await request(app).get(`/documents/${id}/review`);
      assert.equal(review.body.questions[0].pedagogy, undefined, "AI must not overwrite human metadata");
      assert.equal(review.body.questions[0].status, "pending_review");
      await request(app).post(url); assert.equal(calls, 1, "Completed same-content job is cached");
    });
    await t.test("old classification cache is recalculated without BNCC", async () => {
      const file = join(directory, "jobs", id + ".json");
      const old = JSON.parse(await readFile(file, "utf8")); old.version = 2;
      await writeFile(file, JSON.stringify(old));
      globalThis.fetch = async () => response({ suggestions: [suggestion] });
      await request(app).post(url);
      const job = await done(url); assert.equal(job.version, 6);
      assert.equal("bnccSkills" in job.suggestions[0], false);
    });
    await t.test("classifies one question at a time, retries timeout and resumes partial results", async () => {
      const partialId = randomUUID();
      await saveReviewResult({ id: partialId, fileName: "partial.pdf", mimeType: "application/pdf", size: 10, sha256: "test", uploadedAt: new Date().toISOString() }, { pages: 1, method: "pdf-text", text: "test", pageTexts: ["test"] }, [...parsed.questions, ...parsed.questions]);
      let count = 0;
      globalThis.fetch = async (_input, init) => {
        count++;
        const body = JSON.parse(String(init?.body));
        assert.equal(JSON.parse(body.messages[1].content).length, 1);
        if (count === 1) { await new Promise(resolve => setTimeout(resolve, 15)); throw new DOMException("Timed out", "TimeoutError"); }
        if (count === 3) return new Response("Unavailable", { status: 503 });
        return response({ suggestions: [suggestion] });
      };
      const partialUrl = "/documents/" + partialId + "/classification";
      process.env.OLLAMA_TARGET_MS = "1";
      await request(app).post(partialUrl);
      const failed = await done(partialUrl); assert.equal(failed.status, "failed"); assert.equal(failed.suggestions.length, 1);
      assert.ok(failed.suggestions[0].processingMs >= 15, "Timing must include the failed attempt");
      assert.equal(failed.suggestions[0].targetMet, false);
      assert.equal(failed.suggestions[0].targetMs, 1);
      delete process.env.OLLAMA_TARGET_MS;
      await request(app).patch("/documents/" + partialId + "/review/questions/" + failed.suggestions[0].questionId).send({ pedagogy: { discipline: failed.suggestions[0].discipline, grade: failed.suggestions[0].grade } });
      assert.equal((await request(app).get(partialUrl)).body.stale, false, "Accepting AI fields must preserve pending classifications");
      await request(app).post(partialUrl);
      const resumed = await done(partialUrl); assert.equal(resumed.status, "completed"); assert.equal(resumed.suggestions.length, 2);
      assert.equal(count, 4); assert.notEqual(resumed.suggestions[0].questionId, resumed.suggestions[1].questionId);
    });
    await t.test("flags changed content and records failures for retry", async () => {
      await request(app).patch(`/documents/${id}/review/questions/${id}-q1`).send({ prompt: "Quanto é 3 + 3?" });
      assert.equal((await request(app).get(url)).body.stale, true);
      globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
      await request(app).post(url);
      assert.equal((await done(url)).status, "failed");
      globalThis.fetch = async () => response({ suggestions: [suggestion] });
      const retry = await request(app).post(url);
      assert.equal(retry.status, 202);
      assert.notEqual(retry.body.status, "failed", "Retry must enqueue even while the failed job finishes its final disk write");
      assert.equal((await done(url)).status, "completed");
      await request(app).patch(`/documents/${id}/review/questions/${id}-q1`).send({ pedagogy: { grade: "2º ano" } });
      assert.equal((await request(app).get(url)).body.stale, true, "A human grade change must invalidate the classification");
    });
    await t.test("persisted unfinished jobs from another process become retryable failures", async () => {
      const file = join(directory, "jobs", `${id}.json`);
      const job = JSON.parse(await readFile(file, "utf8")); job.status = "running"; job.owner = "old-process";
      await writeFile(file, JSON.stringify(job));
      assert.equal((await request(app).get(url)).body.status, "failed");
    });
    await t.test("rejects malformed indexes and never accepts duplicate classifications", async () => {
      globalThis.fetch = async () => response({ suggestions: [{ ...suggestion, questionIndex: 7 }] });
      await assert.rejects(classifyPedagogy(parsed.questions));
      globalThis.fetch = async () => response({ suggestions: [suggestion, suggestion] });
      await assert.rejects(classifyPedagogy([...parsed.questions, ...parsed.questions]));
      assert.equal((await request(app).post("/documents/not-a-uuid/classification")).status, 400);
      assert.equal((await request(app).post(`/documents/${randomUUID()}/classification`)).status, 404);
    });
    await t.test("classification returns form fields and ignores any unsolicited BNCC", async () => {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.think, false);
        assert.deepEqual(Object.keys(body.format.properties.suggestions.items.properties), ["questionIndex", "discipline", "grade", "topic", "descriptor", "difficulty"]);
        return response({ suggestions: [{ ...suggestion, bnccSkills: ["(EM13MAT02) Descrição inventada", "(EF01MA08) Descrição da habilidade"] }] });
      };
      const [result] = await classifyPedagogy(parsed.questions);
      assert.equal(result!.area, "Matemática");
      assert.equal(result!.questionType, "Múltipla escolha");
      assert.equal("bnccSkills" in result!, false);
      assert.equal(result!.descriptor, "Somar números naturais");
      assert.equal(result!.grade, "", "The model cannot invent a grade absent from the question");
      assert.equal(result!.difficulty, "easy");
      assert.equal("rationale" in result!, false);
      assert.equal("confidence" in result!, false);
    });
    await t.test("fast profile limits only model context, preserves human grade and measures budget", async () => {
      const original = { ...parsed.questions[0]!, prompt: "Início " + "x".repeat(7000) + " final?", pedagogy: { grade: "1º ano" } };
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.options.num_ctx, 2048); assert.equal(body.options.num_gpu, 16); assert.equal(body.options.num_predict, 192);
        const input = JSON.parse(body.messages[1].content)[0];
        assert.ok(input.prompt.length < 2100); assert.ok(input.prompt.endsWith("final?"));
        await new Promise(resolve => setTimeout(resolve, 5));
        return response({ suggestions: [{ ...suggestion, grade: "9º ano", area: "Área inventada" }] });
      };
      process.env.OLLAMA_TARGET_MS = "1"; process.env.OLLAMA_NUM_GPU = "16";
      const [result] = await classifyPedagogy([original]);
      delete process.env.OLLAMA_TARGET_MS; delete process.env.OLLAMA_NUM_GPU;
      assert.equal(result!.grade, "1º ano"); assert.equal(result!.area, "Matemática");
      assert.ok(result!.processingMs! >= 5); assert.equal(result!.targetMet, false);
      assert.equal(original.prompt.length, 7014);
    });
    await t.test("truncated model output reports a clear classification error", async () => {
      globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: '{"q":[' } }));
      await assert.rejects(classifyPedagogy(parsed.questions), /Classificação incompleta/);
    });
    await t.test("unreachable Ollama reports an actionable message instead of raw fetch failure", async () => {
      globalThis.fetch = async () => { throw new TypeError("fetch failed"); };
      await assert.rejects(classifyPedagogy(parsed.questions), /Não foi possível conectar ao Ollama.*Classificar novamente/);
    });
    await t.test("cancel aborts pending Ollama request and supports retry", async () => {
      let aborted = false;
      let entered!: () => void;
      const fetching = new Promise<void>(resolve => { entered = resolve; });
      globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => { aborted = true; reject(init!.signal!.reason); }, { once: true });
        entered();
      });
      const started = await request(app).post(url);
      assert.equal(started.status, 202);
      await fetching;
      const cancelled = await request(app).post(`${url}/cancel`);
      assert.equal(cancelled.body.status, "cancelled");
      assert.equal(aborted, true);
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal((await request(app).get(url)).body.status, "cancelled");
      assert.equal((await request(app).post(`${url}/cancel`)).body.status, "cancelled");
      globalThis.fetch = async () => response({ suggestions: [suggestion] });
      await request(app).post(url);
      assert.equal((await done(url)).status, "completed");
      assert.equal((await request(app).post(`${url}/cancel`)).body.status, "completed");
    });
    await t.test("cancelled queued jobs never call Ollama and empty reviews cannot start AI", async () => {
      const queuedId = randomUUID();
      const origin = { id: queuedId, fileName: "queued.pdf", mimeType: "application/pdf", size: 10, sha256: "test", uploadedAt: new Date().toISOString() };
      await saveReviewResult(origin, { pages: 1, method: "pdf-text", text: "text", pageTexts: ["text"] }, parsed.questions);
      let calls = 0;
      let entered!: () => void;
      const pending = new Promise<void>(resolve => { entered = resolve; });
      globalThis.fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
        calls++; entered();
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      });
      await request(app).patch(`/documents/${id}/review/questions/${id}-q1`).send({ prompt: "Qual é a soma de 4 e 4?" });
      await request(app).post(url); await pending;
      const queuedUrl = `/documents/${queuedId}/classification`;
      assert.equal((await request(app).post(queuedUrl)).body.status, "queued");
      assert.equal((await request(app).post(`${queuedUrl}/cancel`)).body.status, "cancelled");
      await request(app).post(`${url}/cancel`);
      await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(calls, 1);
      assert.equal((await request(app).get(queuedUrl)).body.status, "cancelled");
      const emptyId = randomUUID();
      await saveReviewResult({ ...origin, id: emptyId }, { pages: 1, method: "pdf-text", text: "Texto sem perguntas", pageTexts: ["Texto sem perguntas"] }, []);
      assert.equal((await request(app).post(`/documents/${emptyId}/classification`)).status, 400);
      assert.equal(calls, 1);
    });
  } finally {
    globalThis.fetch = fetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await rm(directory, { recursive: true, force: true });
  }
});

test("area mapping normalizes accents and preserves uncertainty", () => {
  assert.equal(areaForDiscipline(" FÍSICA "), "Ciências da Natureza");
  assert.equal(areaForDiscipline("Língua Portuguesa"), "Linguagens");
  assert.equal(areaForDiscipline("História"), "Ciências Humanas");
  assert.equal(areaForDiscipline("Informática"), "Computação");
  assert.equal(areaForDiscipline("Disciplina desconhecida"), "");
});
