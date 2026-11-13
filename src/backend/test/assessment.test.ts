import assert from "node:assert/strict";
import { test } from "node:test";
import request from "supertest";
import { app } from "../src/app.js";
import { validateAssessment, processAssessment } from "../src/services/assessment.service.js";
import { assessmentFixture } from "./fixtures/assessment.js";

test("assessment correction includes missing answers in every denominator and does not invent response times", () => {
  const results = processAssessment(validateAssessment(assessmentFixture));
  assert.deepEqual(results.summary, { correct: 2, incorrect: 1, omitted: 3, total: 6, percentage: 33.33, timedResponses: 3, totalDurationMs: 4000, averageDurationMs: 1333 });
  assert.equal(results.students[0]!.percentage, 100);
  assert.equal(results.students[2]!.omitted, 2);
  assert.equal(results.students[2]!.averageDurationMs, null);
  assert.deepEqual(results.questions[0]!.distribution, { A: 1, B: 1 });
  assert.equal(results.skills[0]!.total, 6);
  assert.equal(results.skills[1]!.total, 3);
  assert.equal(results.descriptors[1]!.omitted, 2);
});

test("assessment input rejects duplicate identities, foreign answers, bad keys, invalid times and impossible dates", () => {
  for (const mutate of [
    (input: typeof assessmentFixture) => { input.questions.push(input.questions[0]!); },
    (input: typeof assessmentFixture) => { input.students.push(input.students[0]!); },
    (input: typeof assessmentFixture) => { input.students[0]!.answers.other = { answer: "A" }; },
    (input: typeof assessmentFixture) => { input.questions[0]!.answerKey = "Z"; },
    (input: typeof assessmentFixture) => { input.questions[0]!.alternatives[1]!.label = "a"; },
    (input: typeof assessmentFixture) => { input.students[0]!.answers.q1!.answer = "Z"; },
    (input: typeof assessmentFixture) => { input.students[0]!.answers.q1!.durationMs = -1; },
    (input: typeof assessmentFixture) => { input.appliedAt = "2026-02-30"; },
  ]) { const input = structuredClone(assessmentFixture); mutate(input); assert.throws(() => validateAssessment(input)); }
});

test("assessment snapshots normalize labels and exclude unrecognized personal fields", () => {
  const raw = structuredClone(assessmentFixture) as typeof assessmentFixture & { secret?: string };
  raw.secret = "não armazenar";
  Object.assign(raw.students[0]!, { name: "nome não necessário", email: "nao-armazenar@example.test" });
  raw.questions[0]!.answerKey = " b "; raw.students[0]!.answers.q1!.answer = " b ";
  const normalized = validateAssessment(raw);
  assert.equal(normalized.questions[0]!.answerKey, "B");
  assert.equal(normalized.students[0]!.answers.q1!.answer, "B");
  assert.equal("secret" in normalized, false); assert.equal("name" in normalized.students[0]!, false);
});

test("assessment endpoints reject oversized or malformed JSON before persistence", async () => {
  const bad = await request(app).post("/assessments").set("Content-Type", "application/json").send("{");
  assert.equal(bad.status, 400);
  const large = await request(app).post("/assessments").send({ content: "x".repeat(2 * 1024 * 1024) });
  assert.equal(large.status, 413);
});
