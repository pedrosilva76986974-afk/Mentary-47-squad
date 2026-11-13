import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { saveReviewResult } from "../src/services/review-results.service.js";
import { identifyQuestionsDetailed } from "../src/services/question-identification.service.js";
import { cleanupExpiredDocuments } from "../src/services/document-retention.service.js";
import {
  cancelClassification,
  classificationIsActive,
  getClassification,
  startClassification,
} from "../src/services/pedagogical-classification.service.js";

test("retention skips active classifications and removes their snapshots after cancellation finishes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "mentary-active-retention-"));
  const previous = { ...process.env };
  const previousFetch = globalThis.fetch;
  const id = randomUUID();
  try {
    delete process.env.DATABASE_URL;
    process.env.MENTARY_REVIEW_DIRECTORY = join(directory, "reviews");
    process.env.MENTARY_CLASSIFICATION_DIRECTORY = join(directory, "classifications");
    process.env.MENTARY_DOCUMENT_DIRECTORY = join(directory, "documents");
    process.env.MENTARY_UPLOAD_REGISTRY = join(directory, "manifest.json");
    process.env.MENTARY_RETENTION_DAYS = "30";
    process.env.OLLAMA_MODEL = "retention-test";
    const origin = {
      id,
      fileName: "expired.pdf",
      mimeType: "application/pdf",
      size: 1,
      sha256: "fixture",
      uploadedAt: "2000-01-01T00:00:00.000Z",
    };
    await mkdir(process.env.MENTARY_DOCUMENT_DIRECTORY, { recursive: true });
    await writeFile(join(process.env.MENTARY_DOCUMENT_DIRECTORY, `${id}.pdf`), "fixture");
    await writeFile(process.env.MENTARY_UPLOAD_REGISTRY, JSON.stringify([origin]));
    const text = "Questão 1: Quanto é 2 + 2? A) 3 B) 4";
    const parsed = await identifyQuestionsDetailed([text]);
    await saveReviewResult(
      origin,
      { pages: 1, method: "pdf-text", text, pageTexts: [text] },
      parsed.questions,
    );
    globalThis.fetch = async (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        if (init?.signal?.aborted) reject(init.signal.reason);
        else init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
      });
    await startClassification(id);
    assert.equal(await cleanupExpiredDocuments(), 0);
    await cancelClassification(id);
    for (let attempt = 0; classificationIsActive(id) && attempt < 100; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(classificationIsActive(id), false);
    assert.equal(await cleanupExpiredDocuments(), 1);
    assert.equal(await getClassification(id), undefined);
    await assert.rejects(readFile(join(process.env.MENTARY_CLASSIFICATION_DIRECTORY, `${id}.json`)), {
      code: "ENOENT",
    });
  } finally {
    await cancelClassification(id).catch(() => undefined);
    globalThis.fetch = previousFetch;
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
    await rm(directory, { recursive: true, force: true });
  }
});
