import assert from "node:assert/strict";
import { after, test } from "node:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanupExpiredDocuments } from "../src/services/document-retention.service.js";

const testDirectory = await mkdtemp(join(tmpdir(), "mentary-retention-tests-"));
const registryPath = join(testDirectory, "manifest.json");
const reviewDirectory = join(testDirectory, "reviews");
const documentDirectory = join(testDirectory, "documents");
const previousValues = {
  registry: process.env.MENTARY_UPLOAD_REGISTRY,
  reviews: process.env.MENTARY_REVIEW_DIRECTORY,
  documents: process.env.MENTARY_DOCUMENT_DIRECTORY,
  retention: process.env.MENTARY_RETENTION_DAYS,
};

process.env.MENTARY_UPLOAD_REGISTRY = registryPath;
process.env.MENTARY_REVIEW_DIRECTORY = reviewDirectory;
process.env.MENTARY_DOCUMENT_DIRECTORY = documentDirectory;
process.env.MENTARY_RETENTION_DAYS = "30";

after(async () => {
  if (previousValues.registry === undefined) delete process.env.MENTARY_UPLOAD_REGISTRY;
  else process.env.MENTARY_UPLOAD_REGISTRY = previousValues.registry;
  if (previousValues.reviews === undefined) delete process.env.MENTARY_REVIEW_DIRECTORY;
  else process.env.MENTARY_REVIEW_DIRECTORY = previousValues.reviews;
  if (previousValues.documents === undefined) delete process.env.MENTARY_DOCUMENT_DIRECTORY;
  else process.env.MENTARY_DOCUMENT_DIRECTORY = previousValues.documents;
  if (previousValues.retention === undefined) delete process.env.MENTARY_RETENTION_DAYS;
  else process.env.MENTARY_RETENTION_DAYS = previousValues.retention;
  await rm(testDirectory, { recursive: true, force: true });
});

test("removes only expired review files and their origin records", async () => {
  const now = Date.now();
  const expiredId = "11111111-1111-4111-8111-111111111111";
  const recentId = "22222222-2222-4222-8222-222222222222";
  const origin = (id: string, uploadedAt: string) => ({
    id,
    fileName: `${id}.pdf`,
    mimeType: "application/pdf",
    size: 100,
    sha256: "a".repeat(64),
    uploadedAt,
  });
  await mkdir(reviewDirectory, { recursive: true });
  await mkdir(documentDirectory, { recursive: true });
  await writeFile(registryPath, JSON.stringify([
    origin(expiredId, new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString()),
    origin(recentId, new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString()),
  ]));
  await writeFile(join(reviewDirectory, `${expiredId}.json`), "expired");
  await writeFile(join(reviewDirectory, `${recentId}.json`), "recent");
  await writeFile(join(documentDirectory, `${expiredId}.pdf`), "expired source");
  await writeFile(join(documentDirectory, `${recentId}.pdf`), "recent source");

  const removedCount = await cleanupExpiredDocuments(now);
  const remainingRecords = JSON.parse(await readFile(registryPath, "utf8")) as Array<{ id: string }>;

  assert.equal(removedCount, 1);
  assert.deepEqual(remainingRecords.map((record) => record.id), [recentId]);
  await assert.rejects(readFile(join(reviewDirectory, `${expiredId}.json`)));
  await assert.rejects(readFile(join(documentDirectory, `${expiredId}.pdf`)));
  assert.equal(await readFile(join(reviewDirectory, `${recentId}.json`), "utf8"), "recent");
  assert.equal(await readFile(join(documentDirectory, `${recentId}.pdf`), "utf8"), "recent source");
});
