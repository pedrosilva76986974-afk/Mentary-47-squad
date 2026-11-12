import assert from "node:assert/strict";
import { test } from "node:test";
import { withDocumentLock } from "../src/services/document-lock.service.js";

test("document writes wait for the previous operation without blocking a different document", async () => {
  let release!: () => void;
  const events: string[] = [];
  const first = withDocumentLock("a", async () => {
    events.push("first");
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const second = withDocumentLock("a", async () => {
    events.push("second");
  });
  await withDocumentLock("b", async () => {
    events.push("other");
  });
  assert.deepEqual(events, ["first", "other"]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first", "other", "second"]);
});

test("a failed write does not prevent later changes to that document", async () => {
  const failed = withDocumentLock("failed", async () => {
    throw new Error("Expected failure");
  });
  const later = withDocumentLock("failed", async () => "saved");
  await assert.rejects(failed, /Expected failure/);
  assert.equal(await later, "saved");
});
