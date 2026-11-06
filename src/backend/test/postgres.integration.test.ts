import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { closeDatabase, getDatabasePool, initializeDatabase } from "../src/services/database.service.js";
import { getReviewResultFromDatabase, importLegacyReviewResult, saveReviewResultToDatabase } from "../src/services/postgres-review.service.js";
import type { ReviewResult } from "../src/services/review-results.service.js";

test("real PostgreSQL migrations, round trip, rollback and export", {
  skip: process.env.MENTARY_POSTGRES_TEST !== "1",
}, async () => {
  const originalUrl = process.env.DATABASE_URL;
  assert.ok(originalUrl, "Configure DATABASE_URL for the isolated PostgreSQL test.");
  const name = `mentary_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Client({ connectionString: originalUrl });
  await admin.connect();
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    const url = new URL(originalUrl);
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    await initializeDatabase();
    const pool = getDatabasePool();
    assert.equal((await pool.query("SELECT * FROM schema_migrations")).rowCount, 4);
    const id = randomUUID();
    const review: ReviewResult = {
      documentId: id, status: "pending_review", message: "Test fixture", processedAt: new Date().toISOString(),
      origin: { id, fileName: "test.pdf", mimeType: "application/pdf", size: 1, sha256: "test", uploadedAt: new Date().toISOString() },
      pages: 1, method: "pdf-text", sourceText: "Questão de teste",
      questions: [{ id: `${id}-q1`, number: 1, text: "Questão de teste", prompt: "Quanto é 2 + 2?",
        responseType: "multiple_choice", alternatives: [{ label: "A", text: "3" }, { label: "B", text: "4" }],
        answerKey: "B", missingComponents: [], pageStart: 1, pageEnd: 1, confidence: "high", status: "pending_review",
        reviewedBy: "Revisor fictício", pedagogy: { discipline: "Matemática", topic: "Adição", bnccSkills: ["EF01MA01"],
          descriptor: "D1", difficulty: "easy", userId: randomUUID(), institutionId: randomUUID() },
      }],
    };
    await saveReviewResultToDatabase(review);
    assert.equal(await importLegacyReviewResult(review), false);
    assert.equal((await pool.query("SELECT * FROM extrator.approved_question_exports")).rowCount, 0);
    review.questions[0]!.status = "approved";
    await saveReviewResultToDatabase(review);
    const stored = await getReviewResultFromDatabase(id);
    assert.equal(stored!.questions[0]!.answerKey, "B");
    assert.deepEqual(stored!.questions[0]!.alternatives, review.questions[0]!.alternatives);
    const exported = (await pool.query("SELECT * FROM extrator.approved_question_exports")).rows[0];
    assert.equal(exported.is_ready_for_mentary, true);
    assert.equal(exported.mentary_question.correct_answer_index, 1);
    assert.deepEqual(exported.mentary_question.answer_options, ["3", "4"]);
    for (const bncc of [null, '"legacy-invalid"']) {
      await pool.query("UPDATE extrator.review_questions SET pedagogy = jsonb_set(pedagogy, '{bnccSkills}', $1::jsonb)", [bncc ?? "null"]);
      const incomplete = (await pool.query("SELECT * FROM extrator.approved_question_exports")).rows[0];
      assert.equal(incomplete.is_ready_for_mentary, false);
      assert.ok(incomplete.missing_destination_fields.includes("metadata.bncc"));
    }
    await saveReviewResultToDatabase(review);
    // A failed write must roll back the deletion/reinsertion of prior questions.
    const invalid = structuredClone(review);
    invalid.questions[0]!.pageStart = 0;
    await assert.rejects(saveReviewResultToDatabase(invalid));
    assert.equal((await getReviewResultFromDatabase(id))!.questions[0]!.pageStart, 1);
    review.questions[0]!.status = "rejected";
    await saveReviewResultToDatabase(review);
    assert.equal((await pool.query("SELECT * FROM extrator.approved_question_exports")).rowCount, 0);
  } finally {
    await closeDatabase();
    process.env.DATABASE_URL = originalUrl;
    try {
      if (created) await admin.query(`DROP DATABASE "${name}"`);
    } finally { await admin.end(); }
  }
});
