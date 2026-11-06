import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { initializeDatabase, isDatabaseConfigured } from "../src/services/database.service.js";

test("PostgreSQL schema preserves document, question, and alternative relationships", async () => {
  const migration = await readFile(resolve(process.cwd(), "../../database/migrations/001_initial_postgres.sql"), "utf8");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS review_documents/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS review_questions/);
  assert.match(migration, /document_id UUID NOT NULL REFERENCES review_documents\(document_id\) ON DELETE CASCADE/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS question_alternatives/);
  assert.match(migration, /question_id TEXT NOT NULL REFERENCES review_questions\(question_id\) ON DELETE CASCADE/);
  assert.match(migration, /CHECK \(response_type = 'multiple_choice'\)/);
  assert.match(migration, /UNIQUE \(question_id, label\)/);

  const duplicateLabelMigration = await readFile(
    resolve(process.cwd(), "../../database/migrations/002_allow_duplicate_alternative_labels.sql"),
    "utf8",
  );
  assert.match(duplicateLabelMigration, /DROP CONSTRAINT IF EXISTS question_alternatives_question_id_label_key/);

  const integrationMigration = await readFile(
    resolve(process.cwd(), "../../database/migrations/003_extrator_schema_and_mentary_export.sql"),
    "utf8",
  );
  assert.match(integrationMigration, /CREATE SCHEMA IF NOT EXISTS extrator/);
  assert.match(integrationMigration, /ALTER TABLE public\.review_documents SET SCHEMA extrator/);
  assert.match(integrationMigration, /CREATE OR REPLACE VIEW extrator\.approved_question_exports/);
  assert.match(integrationMigration, /correct_answer_index/);
  assert.match(integrationMigration, /is_ready_for_mentary/);
  assert.doesNotMatch(integrationMigration, /ALTER\s+TABLE\s+public\.questions/i);
});

test("PostgreSQL initialization remains optional for existing local-only runs", async () => {
  const previousUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    assert.equal(isDatabaseConfigured(), false);
    await initializeDatabase();
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
  }
});
