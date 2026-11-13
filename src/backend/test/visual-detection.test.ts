import assert from "node:assert/strict";
import { test } from "node:test";
import { detectVisualReference } from "../src/services/visual-detection.service.js";

test("a broken PDF visual returns an explicit warning instead of failing document extraction", async () => {
  const broken = { getOperatorList: async () => { throw new Error("Corrupt image"); } };
  const reference = await detectVisualReference(broken, 2);
  assert.equal(reference?.page, 2);
  assert.equal(reference?.association, "unconfirmed");
  assert.match(reference?.extractionWarning ?? "", /documento original/);
  assert.equal(reference?.region, undefined);
});

test("visual recovery never swallows a user cancellation", async () => {
  const controller = new AbortController();
  const broken = { getOperatorList: async () => { controller.abort(); throw new Error("Cancelled"); } };
  await assert.rejects(detectVisualReference(broken, 1, controller.signal), { name: "AbortError" });
});
