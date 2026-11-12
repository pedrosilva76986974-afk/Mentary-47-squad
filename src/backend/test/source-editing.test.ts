import assert from "node:assert/strict";
import { test } from "node:test";
import { applySourceCrop, type QuestionSource } from "../../frontend/src/utils/source-editing.js";

const crop = { x: 0.1, y: 0.2, width: 0.7, height: 0.3 };

test("changing a primary crop page replaces the old preview and preserves secondary references", () => {
  const original: QuestionSource = {
    pageStart: 1, pageEnd: 3,
    visualReferences: [
      { page: 1, kind: "image", association: "automatic" },
      { page: 3, kind: "graphic", association: "unconfirmed" },
    ],
  };
  const updated = applySourceCrop(original, 2, 3, crop);
  assert.deepEqual(updated.visualReferences?.map(reference => reference.page), [2, 3]);
  assert.equal(updated.visualReferences?.[0]?.association, "manual");
  assert.equal(updated.pageStart, 2);
  assert.equal(original.visualReferences?.[0]?.page, 1);
  const repeated = applySourceCrop(updated, 3, 3, crop);
  assert.deepEqual(repeated.visualReferences?.map(reference => reference.page), [3]);
});

test("source crop validation rejects unknown pages, non-finite coordinates and oversized regions", () => {
  const original = { pageStart: null, pageEnd: null };
  for (const page of [0, -1, 1.5, 3, NaN]) {
    assert.throws(() => applySourceCrop(original, page, 2, crop), /página válida/);
  }
  for (const region of [{ ...crop, x: NaN }, { ...crop, y: Infinity }, { ...crop, width: 0 }, { ...crop, width: 1 }]) {
    assert.throws(() => applySourceCrop(original, 1, 2, region), /recorte/);
  }
  assert.equal(applySourceCrop(original, 1, 2, crop).visualReferences?.[0]?.page, 1);
});
