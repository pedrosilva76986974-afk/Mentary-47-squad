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
import { classifyPedagogy } from "../src/services/ollama.service.js";

const suggestion = { questionIndex: 0, area: "Matemática", discipline: "Matemática", questionType: "Múltipla escolha", bnccSkills: ["EF01MA08"], rationale: "Adição de números naturais; conferir etapa.", confidence: "medium" };
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
      assert.deepEqual(job.suggestions[0].bnccSkills, ["EF01MA08"]);
      assert.equal(job.suggestions[0].questionId, `${id}-q1`);
      const review = await request(app).get(`/documents/${id}/review`);
      assert.equal(review.body.questions[0].pedagogy, undefined, "AI must not overwrite human metadata");
      assert.equal(review.body.questions[0].status, "pending_review");
      await request(app).post(url); assert.equal(calls, 1, "Completed same-content job is cached");
    });
    await t.test("flags changed content and records failures for retry", async () => {
      await request(app).patch(`/documents/${id}/review/questions/${id}-q1`).send({ prompt: "Quanto é 3 + 3?" });
      assert.equal((await request(app).get(url)).body.stale, true);
      globalThis.fetch = async () => new Response("Unavailable", { status: 503 });
      await request(app).post(url);
      assert.equal((await done(url)).status, "failed");
      globalThis.fetch = async () => response({ suggestions: [suggestion] });
      await request(app).post(url); assert.equal((await done(url)).status, "completed");
      await request(app).patch(`/documents/${id}/review/questions/${id}-q1`).send({ pedagogy: { grade: "1º ano" } });
      assert.equal((await request(app).get(url)).body.stale, true, "Grade changes must invalidate BNCC suggestions");
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
    await t.test("bad BNCC cannot discard valid area and question type", async () => {
      globalThis.fetch = async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.think, false);
        assert.deepEqual(Object.keys(body.format.properties.suggestions.items.properties), ["questionIndex", "area", "discipline", "questionType", "bnccSkills"]);
        return response({ suggestions: [{ ...suggestion, bnccSkills: ["(EM13MAT02) Descrição inventada", "(EF01MA08) Descrição da habilidade"] }] });
      };
      const [result] = await classifyPedagogy(parsed.questions);
      assert.equal(result!.area, "Matemática");
      assert.equal(result!.questionType, "Múltipla escolha");
      assert.deepEqual(result!.bnccSkills, ["EF01MA08"]);
      assert.ok(result!.warnings?.length);
      assert.equal("rationale" in result!, false);
      assert.equal("confidence" in result!, false);
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
